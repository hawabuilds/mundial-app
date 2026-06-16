import assert from "node:assert/strict";
import {
  PAYOUT_WEIGHT_DENOMINATOR,
  payoutAmountWei,
  rankPayoutBps,
  rankPayoutWeight,
  TIER1_PAYOUT_WEIGHT,
  TIER2_PAYOUT_WEIGHT,
  TIER3_PAYOUT_WEIGHT,
} from "./payoutTiers";

assert.equal(PAYOUT_WEIGHT_DENOMINATOR, 1070);
assert.equal(TIER1_PAYOUT_WEIGHT, 100);
assert.equal(TIER2_PAYOUT_WEIGHT, 60);
assert.equal(TIER3_PAYOUT_WEIGHT, 35);

assert.equal(rankPayoutWeight(1), 100);
assert.equal(rankPayoutWeight(4), 60);
assert.equal(rankPayoutWeight(11), 35);
assert.equal(rankPayoutWeight(21), null);

assert.equal(rankPayoutBps(1), 935);
assert.equal(rankPayoutBps(4), 561);
assert.equal(rankPayoutBps(11), 327);

const pot = 1_000_000_000_000_000_000n;

assert.equal(payoutAmountWei(pot, 1), 93_457_943_925_233_660n);
assert.equal(payoutAmountWei(pot, 4), 56_074_766_355_140_186n);
assert.equal(payoutAmountWei(pot, 11), 32_710_280_373_831_775n);

const total = Array.from({ length: 20 }, (_, i) =>
  payoutAmountWei(pot, i + 1)!,
).reduce((a, b) => a + b, 0n);
assert.equal(total, pot);

// $1,500 pool — 10 : 6 : 3.5 ratio must consume the full pot
const pot1500 = 1_500_000_000_000_000_000_000n;
const tier1 = payoutAmountWei(pot1500, 1)!;
const tier2 = payoutAmountWei(pot1500, 4)!;
const tier3 = payoutAmountWei(pot1500, 11)!;
assert.ok(tier1 > tier2 && tier2 > tier3);
const total1500 = Array.from({ length: 20 }, (_, i) =>
  payoutAmountWei(pot1500, i + 1)!,
).reduce((a, b) => a + b, 0n);
assert.equal(total1500, pot1500);

console.log("payoutTiers.test.ts: ok");
