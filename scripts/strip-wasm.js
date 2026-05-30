import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Use binaryen to optimize and strip reference-types from WASM
const binaryen = (await import("binaryen")).default;

const wasmPath = resolve("wasm/no_loss_auction.wasm");
const wasmBytes = readFileSync(wasmPath);

console.log(`Reading WASM binary: ${wasmPath} (${wasmBytes.length} bytes)`);

// Load the module with binaryen
const module = binaryen.readBinary(wasmBytes);

// Validate
if (!module.validate()) {
  console.log("WASM module has validation issues - attempting to process anyway...");
}

// Set features to MVP only (no reference types)
module.setFeatures(binaryen.Features.MVP);

// Optimize with MVP features only
binaryen.setOptimizeLevel(2);
binaryen.setShrinkLevel(1);

// Emit the binary without reference types
const optimizedBytes = module.emitBinary();
module.dispose();

writeFileSync(wasmPath, Buffer.from(optimizedBytes));
console.log(`Optimized WASM written: ${wasmPath} (${optimizedBytes.length} bytes)`);
