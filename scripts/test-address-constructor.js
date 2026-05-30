import * as StellarSDK from "@stellar/stellar-sdk";

const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJGWG362243LX6V57J56VKAB2RGLN65NF";
try {
  const decoded = StellarSDK.StrKey.decodeContract(contractId);
  console.log("Decoded contract ID buffer length:", decoded.length);
  const addr = StellarSDK.Address.contract(decoded);
  console.log("Success! Address contract:", addr.toString());
} catch (e) {
  console.error("Failed:", e);
}
