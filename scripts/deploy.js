import * as StellarSDK from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";

const rpcUrl = "https://soroban-testnet.stellar.org";
const server = new StellarSDK.rpc.Server(rpcUrl, { allowHttp: false });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getOrFundAccount(keypair) {
  const publicKey = keypair.publicKey();
  console.log(`Checking account status for: ${publicKey}`);
  try {
    return await server.getAccount(publicKey);
  } catch (err) {
    console.log("Account not found. Funding via Friendbot...");
    const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
    const response = await fetch(friendbotUrl);
    if (!response.ok) {
      throw new Error(`Friendbot funding failed: ${response.statusText}`);
    }
    console.log("Funding successful! Waiting for ledger to close...");
    await sleep(8000);
    return await server.getAccount(publicKey);
  }
}

async function submitAndWait(tx, signerKeypair) {
  tx.sign(signerKeypair);
  console.log("Submitting transaction...");

  // Use sendTransaction + manual polling to avoid SDK parser issues
  const sendResp = await server.sendTransaction(tx);
  if (sendResp.status === "ERROR") {
    console.error("Send error:", JSON.stringify(sendResp));
    throw new Error(`Transaction send failed`);
  }

  const txHash = sendResp.hash;
  console.log(`Tx submitted. Hash: ${txHash}`);

  // Poll using raw fetch to avoid SDK XDR parse bugs on newer protocol responses
  const rpcEndpoint = rpcUrl;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    try {
      const pollResp = await fetch(rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: { hash: txHash },
        }),
      });
      const pollJson = await pollResp.json();
      const result = pollJson.result;

      if (!result) {
        console.log(`Poll ${i+1}: no result yet...`);
        continue;
      }

      console.log(`Poll ${i+1}: status = ${result.status}`);

      if (result.status === "SUCCESS") {
        console.log("Transaction succeeded!");
        // Parse the return value from result meta XDR
        const meta = StellarSDK.xdr.TransactionMeta.fromXDR(result.resultMetaXdr, "base64");
        let returnValue = null;
        try {
          if (meta.switch().value === 3) {
            returnValue = meta.v3().sorobanMeta().returnValue();
          } else if (meta.switch().value === 4) {
            returnValue = meta.v4().sorobanMeta().returnValue();
          }
        } catch (e) {
          console.log("Could not extract return value from meta:", e.message);
        }
        return { status: "SUCCESS", returnValue, raw: result };
      } else if (result.status === "FAILED") {
        throw new Error(`Transaction failed. Result XDR: ${result.resultXdr}`);
      }
      // NOT_FOUND means still pending
    } catch (pollErr) {
      if (pollErr.message?.includes("failed")) throw pollErr;
      console.log(`Poll ${i+1} error (retrying): ${pollErr.message}`);
    }
  }
  throw new Error("Transaction polling timed out after 40 attempts.");
}

async function main() {
  console.log("=== No-Loss Auction - Stellar Testnet Deployment ===\n");

  // 1. Keypair
  let deployerKeypair;
  if (process.env.DEPLOYER_SECRET_KEY) {
    deployerKeypair = StellarSDK.Keypair.fromSecret(process.env.DEPLOYER_SECRET_KEY);
    console.log(`Using provided deployer: ${deployerKeypair.publicKey()}`);
  } else {
    deployerKeypair = StellarSDK.Keypair.random();
    console.log(`Generated deployer public key : ${deployerKeypair.publicKey()}`);
    console.log(`Generated deployer secret key : ${deployerKeypair.secret()}`);
  }

  const deployerAccount = await getOrFundAccount(deployerKeypair);

  // 2. Read WASM
  const wasmPath = path.resolve("wasm/no_loss_auction.wasm");
  if (!fs.existsSync(wasmPath)) throw new Error(`WASM not found: ${wasmPath}`);
  const wasmBytes = fs.readFileSync(wasmPath);
  console.log(`\nLoaded WASM: ${wasmPath} (${wasmBytes.length} bytes)`);

  // 3. Upload WASM
  console.log("\n[Step 1/2] Uploading WASM bytecode...");
  let uploadTx = new StellarSDK.TransactionBuilder(deployerAccount, {
    fee: "200000",
    networkPassphrase: StellarSDK.Networks.TESTNET,
  })
    .addOperation(StellarSDK.Operation.uploadContractWasm({ wasm: wasmBytes }))
    .setTimeout(120)
    .build();

  uploadTx = await server.prepareTransaction(uploadTx);
  const uploadResult = await submitAndWait(uploadTx, deployerKeypair);

  let wasmHash;
  if (uploadResult.returnValue) {
    wasmHash = Buffer.from(uploadResult.returnValue.bytes());
  } else {
    // Fallback: compute hash manually
    const { createHash } = await import("crypto");
    wasmHash = createHash("sha256").update(wasmBytes).digest();
    console.log("Note: Using computed SHA-256 hash as fallback.");
  }
  const wasmHashHex = wasmHash.toString("hex");
  console.log(`WASM hash: ${wasmHashHex}`);

  // 4. Create Contract
  console.log("\n[Step 2/2] Creating contract instance...");
  const freshAccount = await server.getAccount(deployerKeypair.publicKey());

  const salt = crypto.getRandomValues(new Uint8Array(32));
  let createTx = new StellarSDK.TransactionBuilder(freshAccount, {
    fee: "200000",
    networkPassphrase: StellarSDK.Networks.TESTNET,
  })
    .addOperation(
      StellarSDK.Operation.createCustomContract({
        wasmHash,
        address: StellarSDK.Address.fromString(deployerKeypair.publicKey()),
        salt: Buffer.from(salt),
      })
    )
    .setTimeout(120)
    .build();

  createTx = await server.prepareTransaction(createTx);
  const createResult = await submitAndWait(createTx, deployerKeypair);

  // Extract contract ID
  let contractId = "unknown";
  if (createResult.returnValue) {
    try {
      const addrBuf = createResult.returnValue.address().contractId();
      contractId = StellarSDK.StrKey.encodeContract(addrBuf);
    } catch (e) {
      console.log("Could not decode contract ID from return value:", e.message);
    }
  }
  if (contractId === "unknown") {
    // Try to derive contract ID from the preimage
    try {
      const preimage = StellarSDK.xdr.HashIdPreimage.envelopeTypeContractId(
        new StellarSDK.xdr.HashIdPreimageContractId({
          networkId: StellarSDK.hash(Buffer.from(StellarSDK.Networks.TESTNET)),
          contractIdPreimage: StellarSDK.xdr.ContractIdPreimage.contractIdPreimageFromAddress(
            new StellarSDK.xdr.ContractIdPreimageFromAddress({
              address: StellarSDK.Address.fromString(deployerKeypair.publicKey()).toScAddress(),
              salt: Buffer.from(salt),
            })
          ),
        })
      );
      contractId = StellarSDK.StrKey.encodeContract(StellarSDK.hash(preimage.toXDR()));
    } catch (e) {
      console.log("Could not derive contract ID from preimage:", e.message);
    }
  }

  console.log(`\n${"=".repeat(54)}`);
  console.log("  DEPLOYMENT SUCCESSFUL!");
  console.log(`${"=".repeat(54)}`);
  console.log(`  Contract ID  : ${contractId}`);
  console.log(`  Wasm Hash    : ${wasmHashHex}`);
  console.log(`  Deployer     : ${deployerKeypair.publicKey()}`);
  console.log(`  Network      : Stellar Testnet`);
  console.log(`${"=".repeat(54)}\n`);

  // Save config for frontend
  const configDir = path.resolve("frontend/src");
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, "contract-config.json");
  const config = {
    contractId,
    wasmHash: wasmHashHex,
    network: "testnet",
    rpcUrl: rpcUrl,
    networkPassphrase: StellarSDK.Networks.TESTNET,
    deployerPublicKey: deployerKeypair.publicKey(),
    nativeTokenContractId: StellarSDK.Asset.native().contractId(StellarSDK.Networks.TESTNET),
    deployTimestamp: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Config saved to: ${configPath}`);
}

main().catch((err) => {
  console.error("\nDeployment failed:", err.message || err);
  process.exit(1);
});
