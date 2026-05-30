import * as stellarSdk from '@stellar/stellar-sdk';
import contractConfig from './contract-config.json';

const { Contract, xdr, SorobanRpc, TransactionBuilder, BASE_FEE } = stellarSdk;

// Initialize RPC server
const rpcUrl = contractConfig.rpcUrl;
const server = new SorobanRpc.Server(rpcUrl);
const networkPassphrase = contractConfig.networkPassphrase;

// Get contract instance
const contractId = contractConfig.contractId;
const contract = new Contract(contractId);

// Helper function to convert Stellar address to ScAddress
function addressToScAddress(address) {
  const parsed = new stellarSdk.Address(address);
  return parsed.toScAddress();
}

// Helper function to convert ScAddress to Stellar address string
function scAddressToAddress(scAddress) {
  return stellarSdk.Address.fromScAddress(scAddress).toString();
}

// Helper function to get account
async function getAccount(publicKey) {
  try {
    const account = await server.getAccount(publicKey);
    return account;
  } catch (error) {
    throw new Error(`Failed to get account: ${error.message}`);
  }
}

// Helper function to simulate transaction
async function simulateTransaction(tx) {
  try {
    const sim = await server.simulateTransaction(tx);
    return sim;
  } catch (error) {
    throw new Error(`Simulation failed: ${error.message}`);
  }
}

// Helper function to sign and send transaction
async function signAndSendTransaction(tx, secretKey) {
  try {
    const keypair = stellarSdk.Keypair.fromSecret(secretKey);
    const account = await getAccount(keypair.publicKey());
    
    // Prepare transaction
    const preparedTx = await server.prepareTransaction(tx, server.getLatestLedger());
    
    // Sign transaction
    preparedTx.sign(keypair);
    
    // Send transaction
    const result = await server.sendTransaction(preparedTx);
    
    // Wait for transaction to be confirmed
    let txResponse = await server.getTransaction(result.hash);
    
    while (txResponse.status === 'pending' || txResponse.status === 'not_found') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      txResponse = await server.getTransaction(result.hash);
    }
    
    if (txResponse.status === 'success') {
      return txResponse;
    } else {
      throw new Error(`Transaction failed: ${txResponse.status}`);
    }
  } catch (error) {
    throw new Error(`Transaction failed: ${error.message}`);
  }
}

// Contract functions

export async function getAuctionState() {
  try {
    const tx = new TransactionBuilder(new stellarSdk.Account(contractId, '-1'), {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call("get_state"))
      .setTimeout(30)
      .build();
    
    const sim = await simulateTransaction(tx);
    
    if (sim.result && sim.result.toXDR) {
      const result = sim.result.toXDR();
      const parsed = xdr.ScVal.fromXDR(result, 'base64');
      
      // Parse the AuctionState struct
      const state = {
        owner: scAddressToAddress(parsed.obj().get('owner').address()),
        token: scAddressToAddress(parsed.obj().get('token').address()),
        title: parsed.obj().get('title').str().toString(),
        deadline: parsed.obj().get('deadline').u64(),
        min_bid: parsed.obj().get('min_bid').i128(),
        highest_bidder: parsed.obj().get('highest_bidder').switch() === xdr.ScValType.ScvVoid() 
          ? null 
          : scAddressToAddress(parsed.obj().get('highest_bidder').address()),
        highest_bid: parsed.obj().get('highest_bid').i128(),
        finalized: parsed.obj().get('finalized').b(),
        cancelled: parsed.obj().get('cancelled').b(),
      };
      
      return state;
    }
    
    throw new Error('Failed to parse auction state');
  } catch (error) {
    console.error('Error getting auction state:', error);
    throw error;
  }
}

export async function initializeAuction(secretKey, tokenAddress, title, deadline, minBid) {
  try {
    const keypair = stellarSdk.Keypair.fromSecret(secretKey);
    const account = await getAccount(keypair.publicKey());
    
    const ownerScAddress = addressToScAddress(keypair.publicKey());
    const tokenScAddress = addressToScAddress(tokenAddress);
    
    const titleScVal = xdr.ScVal.scoString(title);
    const deadlineScVal = xdr.ScVal.u64(deadline);
    const minBidScVal = xdr.ScVal.i128(minBid);
    
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        contract.call(
          "initialize",
          ownerScAddress,
          tokenScAddress,
          titleScVal,
          deadlineScVal,
          minBidScVal
        )
      )
      .setTimeout(30)
      .build();
    
    const result = await signAndSendTransaction(tx, secretKey);
    return result;
  } catch (error) {
    console.error('Error initializing auction:', error);
    throw error;
  }
}

export async function placeBid(secretKey, amount) {
  try {
    const keypair = stellarSdk.Keypair.fromSecret(secretKey);
    const account = await getAccount(keypair.publicKey());
    
    const bidderScAddress = addressToScAddress(keypair.publicKey());
    const amountScVal = xdr.ScVal.i128(amount);
    
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        contract.call(
          "bid",
          bidderScAddress,
          amountScVal
        )
      )
      .setTimeout(30)
      .build();
    
    const result = await signAndSendTransaction(tx, secretKey);
    return result;
  } catch (error) {
    console.error('Error placing bid:', error);
    throw error;
  }
}

export async function finalizeAuction(secretKey) {
  try {
    const keypair = stellarSdk.Keypair.fromSecret(secretKey);
    const account = await getAccount(keypair.publicKey());
    
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call("finalize"))
      .setTimeout(30)
      .build();
    
    const result = await signAndSendTransaction(tx, secretKey);
    return result;
  } catch (error) {
    console.error('Error finalizing auction:', error);
    throw error;
  }
}

export async function cancelAuction(secretKey) {
  try {
    const keypair = stellarSdk.Keypair.fromSecret(secretKey);
    const account = await getAccount(keypair.publicKey());
    
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call("cancel"))
      .setTimeout(30)
      .build();
    
    const result = await signAndSendTransaction(tx, secretKey);
    return result;
  } catch (error) {
    console.error('Error cancelling auction:', error);
    throw error;
  }
}

export function formatAddress(address) {
  if (!address) return 'None';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}
