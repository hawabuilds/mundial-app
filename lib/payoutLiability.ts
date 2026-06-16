import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { parsePotWei } from "@/app/lib/payoutEpochs";
import {
  getPayoutContractBalanceWei,
  isVoucherClaimedOnChain,
  readPublicPayoutConfig,
  readTotalReservedOnChain,
  type PublicPayoutConfig,
} from "@/lib/payoutContract";
import { payoutAmountWei } from "@/lib/payoutTiers";
import { computeVoucherId } from "@/lib/payoutVoucher";

type SnapshotOwed = {
  epochId: bigint;
  userId: string;
  rank: number;
  potWei: bigint;
};

/** Sum of voucher amounts still owed from finalized epochs before `beforeEpochId`. */
export async function sumUnclaimedPayoutLiabilityWei(
  beforeEpochId: bigint,
): Promise<bigint> {
  const config = readPublicPayoutConfig();
  if (!config) return 0n;

  const owed = await listUnclaimedSnapshotPayouts(beforeEpochId);
  if (owed.length === 0) return 0n;

  const claimedFlags = await Promise.all(
    owed.map((entry) =>
      isVoucherClaimedOnChain(
        config,
        computeVoucherId(entry.epochId, entry.userId),
      ).catch(() => false),
    ),
  );

  let total = 0n;
  for (let i = 0; i < owed.length; i += 1) {
    if (claimedFlags[i]) continue;
    const amount = payoutAmountWei(owed[i]!.potWei, owed[i]!.rank);
    if (amount && amount > 0n) total += amount;
  }

  return total;
}

async function listUnclaimedSnapshotPayouts(
  beforeEpochId: bigint,
): Promise<SnapshotOwed[]> {
  const supabase = getSupabaseAdminClient();
  const beforeNumeric = Number(beforeEpochId);

  const { data: epochs, error: epochsError } = await supabase
    .from("payout_epochs")
    .select("epoch_id, pot_wei")
    .not("finalized_at", "is", null)
    .lt("epoch_id", beforeNumeric);

  if (epochsError) {
    throw new Error(epochsError.message);
  }

  if (!epochs?.length) return [];

  const epochIds = epochs
    .map((row) => {
      const potWei = parsePotWei(row.pot_wei);
      if (!potWei) return null;
      return { epochId: BigInt(row.epoch_id), potWei };
    })
    .filter((row): row is { epochId: bigint; potWei: bigint } => row !== null);

  if (epochIds.length === 0) return [];

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("leaderboard_snapshots")
    .select("epoch_id, user_id, rank")
    .in(
      "epoch_id",
      epochIds.map((e) => Number(e.epochId)),
    );

  if (snapshotsError) {
    throw new Error(snapshotsError.message);
  }

  const potByEpoch = new Map(
    epochIds.map((e) => [Number(e.epochId), e.potWei] as const),
  );

  const owed: SnapshotOwed[] = [];
  for (const row of snapshots ?? []) {
    const potWei = potByEpoch.get(row.epoch_id);
    if (!potWei) continue;
    owed.push({
      epochId: BigInt(row.epoch_id),
      userId: row.user_id,
      rank: row.rank,
      potWei,
    });
  }

  return owed;
}

export type AvailableEpochPot = {
  contractBalanceWei: bigint;
  reservedLiabilityWei: bigint;
  totalReservedOnChainWei: bigint;
  availablePotWei: bigint;
  config: PublicPayoutConfig;
};

/**
 * Funds available for a new epoch: contract balance minus on-chain totalReserved.
 * Matches openEpoch's rule so each day's pot is exactly the unreserved tBNB in the contract.
 */
export async function getAvailableEpochPotWei(
  forEpochId: bigint,
): Promise<AvailableEpochPot | null> {
  const onChain = await getPayoutContractBalanceWei();
  if (!onChain) return null;

  const reservedLiabilityWei = await sumUnclaimedPayoutLiabilityWei(forEpochId);
  const totalReservedOnChainWei =
    (await readTotalReservedOnChain()) ?? 0n;

  const availablePotWei =
    onChain.balance > totalReservedOnChainWei
      ? onChain.balance - totalReservedOnChainWei
      : 0n;

  return {
    contractBalanceWei: onChain.balance,
    reservedLiabilityWei,
    totalReservedOnChainWei,
    availablePotWei,
    config: onChain.config,
  };
}
