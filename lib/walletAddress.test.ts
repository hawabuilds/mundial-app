import assert from "node:assert/strict";
import { getAddress } from "viem";
import { parseWalletAddress } from "./walletAddress";

const sample = getAddress("0x0000000000000000000000000000000000000001");
assert.equal(parseWalletAddress(sample), sample);
assert.equal(
  parseWalletAddress("0x0000000000000000000000000000000000000001"),
  sample,
);
assert.equal(parseWalletAddress("not-an-address"), null);
assert.equal(parseWalletAddress(""), null);
assert.equal(parseWalletAddress(null), null);

console.log("walletAddress.test.ts: ok");
