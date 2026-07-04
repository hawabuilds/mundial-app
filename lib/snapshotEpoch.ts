import {
  countSnapshotRows,
  insertLeaderboardSnapshot,
} from "@/app/lib/leaderboardSnapshots";
import {
  ensurePayoutEpochForSnapshot,
  hasFinalizedEpochForUtcDay,
  markPayoutEpochFinalized,
  parsePotWei,
} from "@/app/lib/payoutEpochs";
import { getLeaderboard } from "@/app/lib/supabase";
import {
  epochIdForDate,
  getFirstSnapshotEpochId,
  isBeforeFirstSnapshotEpoch,
} from "@/lib/epochId";
import { fetchBnbUsdPrice } from "@/lib/bnbUsdPrice";
import { potUsdCentsFromUsdcBaseUnits } from "@/lib/formatUsdc";
import { potUsdCentsFromWei } from "@/lib/potUsd";
import { isTopTwentyRank } from "@/lib/payoutTiers";
import {
  resolveSolanaOpenEpochId,
  useSequentialSolanaEpochIds,
} from "@/lib/solanaEpochId";
import {
  ensureSolanaPayoutEpochForSnapshot,
  isSolanaPayoutEnabled,
} from "@/lib/solanaPayoutEpoch";
import { readSolanaPayoutConfig } from "@/lib/solanaPayoutConfig";
import { Connection } from "@solana/web3.js";
import type { OpenSolanaEpochResult } from "@/lib/solanaOpenEpoch";
import type { EnsureEpochOpenResult } from "@/lib/payoutOpenEpoch";

export type SnapshotEpochResult =
  | { status: "skipped"; reason: string; epochId: string }
  | {
      status: "created";
      epochId: string;
      rows: number;
      potWei: string;
      potUsdCents: number;
      bnbUsdAtSnapshot: number | null;
      finalizedAt: string;
      payoutRail: "solana" | "bnb";
      epochAutoCreated?: boolean;
      potSyncedFromContract?: boolean;
      contractBalanceWei?: string;
      reservedLiabilityWei?: string;
      availablePotWei?: string;
      epochOpenOnChain?: EnsureEpochOpenResult | OpenSolanaEpochResult;
    };

async function resolveSnapshotEpochId(now: Date): Promise<bigint | null> {
  const calendarEpochId = epochIdForDate(now);

  if (isSolanaPayoutEnabled() && useSequentialSolanaEpochIds()) {
    const config = readSolanaPayoutConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    return resolveSolanaOpenEpochId({ connection, programId: config.programId });
  }

  return calendarEpochId;
}

export async function snapshotEpochLeaderboard(
  now: Date = new Date(),
): Promise<SnapshotEpochResult> {
  const solanaPayout = isSolanaPayoutEnabled();
  const calendarEpochId = epochIdForDate(now);
  const sequentialEpochs = solanaPayout && useSequentialSolanaEpochIds();

  if (isBeforeFirstSnapshotEpoch(calendarEpochId)) {
    const first = getFirstSnapshotEpochId()!.toString();
    return {
      status: "skipped",
      reason: `First snapshot is scheduled for epoch ${first} (10:00 UTC that day)`,
      epochId: calendarEpochId.toString(),
    };
  }

  if (sequentialEpochs) {
    if (await hasFinalizedEpochForUtcDay(now)) {
      return {
        status: "skipped",
        reason: "Snapshot already exists for this UTC day",
        epochId: calendarEpochId.toString(),
      };
    }
  } else {
    const existingRows = await countSnapshotRows(calendarEpochId);
    if (existingRows > 0) {
      return {
        status: "skipped",
        reason: "Snapshot already exists for this epoch",
        epochId: calendarEpochId.toString(),
      };
    }
  }

  const epochId = await resolveSnapshotEpochId(now);
  if (epochId === null) {
    return {
      status: "skipped",
      reason: "Could not resolve epoch id — is the Solana program initialized?",
      epochId: calendarEpochId.toString(),
    };
  }

  const epochKey = epochId.toString();

  const topTwenty = (await getLeaderboard(20)).filter((entry) =>
    isTopTwentyRank(entry.rank),
  );

  if (topTwenty.length === 0) {
    return {
      status: "skipped",
      reason: "No scored players on leaderboard yet",
      epochId: epochKey,
    };
  }

  const ensured = solanaPayout
    ? await ensureSolanaPayoutEpochForSnapshot(epochId)
    : await ensurePayoutEpochForSnapshot(epochId);

  if (!ensured.epoch) {
    return {
      status: "skipped",
      reason: ensured.reason,
      epochId: epochKey,
    };
  }

  const epoch = ensured.epoch;
  const epochAutoCreated = ensured.created;
  const potSyncedFromContract = ensured.potSyncedFromContract;
  const potSync = "potSync" in ensured ? ensured.potSync : undefined;

  if (epoch.finalized_at) {
    return {
      status: "skipped",
      reason: "Epoch already finalized",
      epochId: epochKey,
    };
  }

  const potWei = parsePotWei(epoch.pot_wei);
  if (!potWei) {
    return {
      status: "skipped",
      reason: "Invalid pot_wei on payout_epochs row",
      epochId: epochKey,
    };
  }

  const epochOpen = potSync?.epochOpenOnChain;
  if (solanaPayout) {
    if (
      epochOpen &&
      epochOpen.status === "error" &&
      process.env.SOLANA_OPERATOR_SECRET_KEY?.trim()
    ) {
      return {
        status: "skipped",
        reason: `Could not open Solana epoch: ${epochOpen.reason}`,
        epochId: epochKey,
      };
    }
  } else if (
    epochOpen &&
    epochOpen.status === "error" &&
    process.env.PAYOUT_OPERATOR_PRIVATE_KEY?.trim()
  ) {
    return {
      status: "skipped",
      reason: `Could not open epoch on payout contract: ${epochOpen.reason}`,
      epochId: epochKey,
    };
  }

  const rows = await insertLeaderboardSnapshot(epochId, topTwenty);

  let potUsdCents: number;
  let bnbUsdAtSnapshot: number | null = null;
  if (solanaPayout) {
    potUsdCents = potUsdCentsFromUsdcBaseUnits(potWei);
  } else {
    bnbUsdAtSnapshot = await fetchBnbUsdPrice();
    potUsdCents = potUsdCentsFromWei(potWei, bnbUsdAtSnapshot);
  }

  await markPayoutEpochFinalized(epochId, potUsdCents);

  const balanceField =
    potSync && "vaultBalance" in potSync
      ? potSync.vaultBalance
      : potSync && "contractBalanceWei" in potSync
        ? potSync.contractBalanceWei
        : undefined;
  const reservedField =
    potSync && "totalReserved" in potSync
      ? potSync.totalReserved
      : potSync && "reservedLiabilityWei" in potSync
        ? potSync.reservedLiabilityWei
        : undefined;
  const availableField =
    potSync && "availablePot" in potSync
      ? potSync.availablePot
      : potSync && "availablePotWei" in potSync
        ? potSync.availablePotWei
        : undefined;

  return {
    status: "created",
    epochId: epochKey,
    rows,
    potWei: potWei.toString(),
    potUsdCents,
    bnbUsdAtSnapshot,
    finalizedAt: new Date().toISOString(),
    payoutRail: solanaPayout ? "solana" : "bnb",
    ...(epochAutoCreated ? { epochAutoCreated: true } : {}),
    ...(potSyncedFromContract ? { potSyncedFromContract: true } : {}),
    ...(balanceField
      ? {
          contractBalanceWei: balanceField,
          reservedLiabilityWei: reservedField,
          availablePotWei: availableField,
          epochOpenOnChain: epochOpen,
        }
      : {}),
  };
}
