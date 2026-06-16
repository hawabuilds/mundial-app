import { formatUnits } from "viem";

export function potUsdCentsFromWei(potWei: bigint, bnbUsd: number): number {
  const bnb = Number(formatUnits(potWei, 18));
  if (!Number.isFinite(bnb) || bnb <= 0 || !Number.isFinite(bnbUsd) || bnbUsd <= 0) {
    throw new Error("Cannot compute pot USD from invalid BNB amount or price");
  }

  return Math.round(bnb * bnbUsd * 100);
}

export function potUsdFromCents(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  return cents / 100;
}
