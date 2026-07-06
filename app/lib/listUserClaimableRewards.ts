import { parsePotWei } from "@/app/lib/payoutEpochs";
import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { formatEpochDayLabels } from "@/lib/epochId";
import { formatUsdcFromBaseUnits } from "@/lib/formatUsdc";
import { payoutAmountWei, rankToTierLabel } from "@/lib/payoutTiers";
import { resolveSnapshotWinner } from "@/lib/resolveSnapshotWinner";
import { isSolanaVoucherClaimed } from "@/lib/solanaClaimMarker";
import { readSolanaPayoutConfig } from "@/lib/solanaPayoutConfig";
import { Connection } from "@solana/web3.js";

const ON_CHAIN_READ_TIMEOUT_MS = 8_000;
const USDC_DECIMALS = 6;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

type SessionLike = {
  user?: {
    id?: string | number;
    name?: string | null;
    username?: string | null;
  } | null;
} | null;

export type ClaimableRewardDto = {
  id: string;
  epochId: string;
  rank: number;
  tier: string;
  pts: number;
  amountWei: string;
  bnb: number;
  usdc: number | null;
  prizeLabel: string;
  claimed: boolean;
  day: string;
  date: string;
  finalizedAt: string;
};

export async function listUserClaimableRewards(
  session: SessionLike,
): Promise<ClaimableRewardDto[]> {
  const supabase = getSupabaseAdminClient();
  const { data: epochs, error } = await supabase
    .from("payout_epochs")
    .select("epoch_id, pot_wei, finalized_at")
    .not("finalized_at", "is", null)
    .order("epoch_id", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  if (!epochs?.length) return [];

  const solanaConfig = readSolanaPayoutConfig();
  const solanaConnection = new Connection(solanaConfig.rpcUrl, "confirmed");
  const rewards: ClaimableRewardDto[] = [];

  for (const epoch of epochs) {
    const epochId = BigInt(epoch.epoch_id);
    const snapshot = await resolveSnapshotWinner(epochId, session);
    if (!snapshot) continue;

    const potWei = parsePotWei(epoch.pot_wei);
    if (!potWei) continue;

    const amountWei = payoutAmountWei(potWei, snapshot.rank);
    if (!amountWei || amountWei <= 0n) continue;

    const onChainClaimed = await withTimeout(
      isSolanaVoucherClaimed(
        solanaConnection,
        solanaConfig.programId,
        epochId,
        snapshot.user_id,
      ),
      ON_CHAIN_READ_TIMEOUT_MS,
    );
    const claimed = onChainClaimed ?? false;

    const { day, date } = formatEpochDayLabels(
      epochId,
      epoch.finalized_at as string,
    );

    const usdc = Number(amountWei) / 10 ** USDC_DECIMALS;
    const prizeLabel = `${formatUsdcFromBaseUnits(amountWei, { maxFractionDigits: 2 })} USDC`;

    rewards.push({
      id: String(epoch.epoch_id),
      epochId: String(epoch.epoch_id),
      rank: snapshot.rank,
      tier: rankToTierLabel(snapshot.rank),
      pts: snapshot.total_points,
      amountWei: amountWei.toString(),
      bnb: 0,
      usdc,
      prizeLabel,
      claimed,
      day,
      date,
      finalizedAt: epoch.finalized_at as string,
    });
  }

  return rewards;
}
