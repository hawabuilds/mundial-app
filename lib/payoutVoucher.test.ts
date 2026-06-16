import assert from "node:assert/strict";
import { getAddress } from "viem";
import { epochIdForDate } from "./epochId";
import { computeVoucherId, computeVoucherInnerHash } from "./payoutVoucher";

assert.equal(epochIdForDate(new Date("2026-05-28T12:00:00Z")), 20260528n);

const epochId = 20260528n;
const userId = "123456789";
const voucherId = computeVoucherId(epochId, userId);
assert.equal(voucherId.length, 66);

const inner = computeVoucherInnerHash({
  contractAddress: getAddress("0x0000000000000000000000000000000000000001"),
  chainId: 97n,
  epochId,
  to: getAddress("0x0000000000000000000000000000000000000002"),
  amount: 100_000_000_000_000_000n,
  voucherId,
});

assert.equal(inner.length, 66);
assert.equal(
  computeVoucherId(epochId, userId),
  computeVoucherId(epochId, userId),
);

console.log("payoutVoucher.test.ts: ok");
