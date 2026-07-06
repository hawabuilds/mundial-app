import assert from "node:assert/strict";
import {
  readPublicSolanaCluster,
  readPublicSolanaRpcUrl,
  readServerSolanaCluster,
  readServerSolanaRpcUrl,
  SOLANA_NETWORK_LABEL,
  solanaExplorerClusterParam,
} from "./solanaPublicConfig";

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${error instanceof Error ? error.message : error}`);
  }
}

console.log("solanaPublicConfig tests\n");

run("cluster is always devnet", () => {
  assert.equal(readPublicSolanaCluster(), "devnet");
  assert.equal(readServerSolanaCluster(), "devnet");
});

run("network label is Devnet", () => {
  assert.equal(SOLANA_NETWORK_LABEL, "Devnet");
});

run("explorer links always target devnet", () => {
  assert.equal(solanaExplorerClusterParam(), "?cluster=devnet");
});

run("ignores non-devnet RPC env", () => {
  process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
  assert.equal(readServerSolanaRpcUrl(), "https://api.devnet.solana.com");
  assert.equal(readPublicSolanaRpcUrl(), "https://api.devnet.solana.com");
  delete process.env.SOLANA_RPC_URL;
  delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
