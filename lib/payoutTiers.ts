/**
 * Per-person pool share weights (10 : 6 : 3.5) for ranks 1–3 / 4–10 / 11–20.
 * Weights sum to 107; scale by 1070 so the full pot is distributed exactly once.
 */
export const TIER1_PAYOUT_WEIGHT = 100; // 10% of pool at $1,605 scale → ~9.35% normalized
export const TIER2_PAYOUT_WEIGHT = 60;
export const TIER3_PAYOUT_WEIGHT = 35;

export const PAYOUT_WEIGHT_DENOMINATOR =
  3 * TIER1_PAYOUT_WEIGHT +
  7 * TIER2_PAYOUT_WEIGHT +
  10 * TIER3_PAYOUT_WEIGHT; // 1070 = 107 × 10

export function rankPayoutWeight(rank: number): number | null {
  if (rank >= 1 && rank <= 3) return TIER1_PAYOUT_WEIGHT;
  if (rank >= 4 && rank <= 10) return TIER2_PAYOUT_WEIGHT;
  if (rank >= 11 && rank <= 20) return TIER3_PAYOUT_WEIGHT;
  return null;
}

/** Basis points of epoch pot (10000 = 100%); rounded for display. */
export function rankPayoutBps(rank: number): number | null {
  const weight = rankPayoutWeight(rank);
  if (weight === null) return null;
  return Math.round((10_000 * weight) / PAYOUT_WEIGHT_DENOMINATOR);
}

function basePayoutAmountWei(potWei: bigint, rank: number): bigint | null {
  const weight = rankPayoutWeight(rank);
  if (weight === null || potWei <= 0n) return null;
  return (potWei * BigInt(weight)) / BigInt(PAYOUT_WEIGHT_DENOMINATOR);
}

export function payoutAmountWei(potWei: bigint, rank: number): bigint | null {
  const amount = basePayoutAmountWei(potWei, rank);
  if (amount === null) return null;
  if (rank !== 1) return amount;

  const distributed = Array.from({ length: 20 }, (_, i) =>
    basePayoutAmountWei(potWei, i + 1)!,
  ).reduce((sum, value) => sum + value, 0n);
  return amount + (potWei - distributed);
}

export function isTopTwentyRank(rank: number): boolean {
  return rank >= 1 && rank <= 20;
}

export function rankToTierLabel(rank: number): string {
  if (rank >= 1 && rank <= 3) return "Tier 1";
  if (rank >= 4 && rank <= 10) return "Tier 2";
  if (rank >= 11 && rank <= 20) return "Tier 3";
  return "Tier 3";
}
