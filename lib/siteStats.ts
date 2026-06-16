import { getPayoutEpoch, parsePotWei } from "@/app/lib/payoutEpochs";
import { getLeaderboard } from "@/app/lib/supabase";
import { readMaxOpenEpochPotWei } from "@/lib/payoutContract";
import { epochIdForDate } from "@/lib/epochId";
import { readOnChainEpoch } from "@/lib/payoutOpenEpoch";
import { potUsdFromCents } from "@/lib/potUsd";
import { formatUnits } from "viem";

export type SiteStats = {
  totalPlayers: number;
  prizePoolBnb: number | null;
  prizePoolUsd: number | null;
  /** True when USD was locked at daily snapshot (not a live estimate). */
  prizePoolUsdAtSnapshot: boolean;
};

const ON_CHAIN_READ_TIMEOUT_MS = 8_000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

type TodaysPool = {
  wei: bigint;
  usdCents: number | null;
};

/** Today's daily pool: opened epoch pot, else DB row, else unreserved contract BNB. */
async function readTodaysDailyPool(): Promise<TodaysPool | null> {
  const epochId = epochIdForDate(new Date());
  const row = await getPayoutEpoch(epochId);
  const dbPot = parsePotWei(row?.pot_wei);

  if (row?.finalized_at && dbPot && dbPot > 0n) {
    return {
      wei: dbPot,
      usdCents:
        row.pot_usd_cents != null && row.pot_usd_cents > 0
          ? row.pot_usd_cents
          : null,
    };
  }

  if (dbPot && dbPot > 0n) {
    return { wei: dbPot, usdCents: null };
  }

  const onChain = await withTimeout(readOnChainEpoch(epochId), ON_CHAIN_READ_TIMEOUT_MS);
  if (onChain?.open && onChain.pot > 0n) {
    return { wei: onChain.pot, usdCents: null };
  }

  const spare = await withTimeout(readMaxOpenEpochPotWei(), ON_CHAIN_READ_TIMEOUT_MS);
  if (spare && spare.maxPot > 0n) {
    return { wei: spare.maxPot, usdCents: null };
  }

  return null;
}

export async function getSiteStats(): Promise<SiteStats> {
  const players = await getLeaderboard();
  const pool = await readTodaysDailyPool();

  if (!pool || pool.wei <= 0n) {
    return {
      totalPlayers: players.length,
      prizePoolBnb: null,
      prizePoolUsd: null,
      prizePoolUsdAtSnapshot: false,
    };
  }

  const prizePoolBnb = Number(formatUnits(pool.wei, 18));
  const snapshotUsd = potUsdFromCents(pool.usdCents);

  return {
    totalPlayers: players.length,
    prizePoolBnb: Number.isFinite(prizePoolBnb) ? prizePoolBnb : null,
    prizePoolUsd: snapshotUsd,
    prizePoolUsdAtSnapshot: snapshotUsd != null,
  };
}
