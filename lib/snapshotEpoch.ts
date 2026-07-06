import {
  countSnapshotRows,
  insertLeaderboardSnapshot,
} from "@/app/lib/leaderboardSnapshots";
import {
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
import { potUsdCentsFromUsdcBaseUnits } from "@/lib/formatUsdc";
import { isTopTwentyRank } from "@/lib/payoutTiers";
import {
  resolveSolanaOpenEpochId,
  useSequentialSolanaEpochIds,
} from "@/lib/solanaEpochId";
import { ensureSolanaPayoutEpochForSnapshot } from "@/lib/solanaPayoutEpoch";
import { readSolanaPayoutConfig } from "@/lib/solanaPayoutConfig";
import { Connection } from "@solana/web3.js";
import type { OpenSolanaEpochResult } from "@/lib/solanaOpenEpoch";

export type SnapshotEpochResult =
  | { status: "skipped"; reason: string; epochId: string }
  | {
      status: "created";
      epochId: string;
      rows: number;
      potWei: string;
      potUsdCents: number;
      bnbUsdAtSnapshot: null;
      finalizedAt: string;
      payoutRail: "solana";
      epochAutoCreated?: boolean;
      potSyncedFromContract?: boolean;
      contractBalanceWei?: string;
      reservedLiabilityWei?: string;
      availablePotWei?: string;
      epochOpenOnChain?: OpenSolanaEpochResult;
    };

async function resolveSnapshotEpochId(now: Date): Promise<bigint | null> {
  const calendarEpochId = epochIdForDate(now);

  if (useSequentialSolanaEpochIds()) {
    const config = readSolanaPayoutConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    return resolveSolanaOpenEpochId({ connection, programId: config.programId });
  }

  return calendarEpochId;
}

export async function snapshotEpochLeaderboard(
  now: Date = new Date(),
): Promise<SnapshotEpochResult> {
  let solanaConfig;
  try {
    solanaConfig = readSolanaPayoutConfig();
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Solana payout is not configured";
    return {
      status: "skipped",
      reason,
      epochId: epochIdForDate(now).toString(),
    };
  }

  const calendarEpochId = epochIdForDate(now);
  const sequentialEpochs = useSequentialSolanaEpochIds();

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

  const ensured = await ensureSolanaPayoutEpochForSnapshot(epochId);

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
  const potSync = ensured.potSync;

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

  const rows = await insertLeaderboardSnapshot(epochId, topTwenty);
  const potUsdCents = potUsdCentsFromUsdcBaseUnits(potWei);

  await markPayoutEpochFinalized(epochId, potUsdCents);

  const balanceField = potSync?.vaultBalance;
  const reservedField = potSync?.totalReserved;
  const availableField = potSync?.availablePot;

  return {
    status: "created",
    epochId: epochKey,
    rows,
    potWei: potWei.toString(),
    potUsdCents,
    bnbUsdAtSnapshot: null,
    finalizedAt: new Date().toISOString(),
    payoutRail: "solana",
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
