import { parsePotWei } from "@/app/lib/payoutEpochs";
import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { formatEpochDayLabels } from "@/lib/epochId";
import { formatUsdcFromBaseUnits } from "@/lib/formatUsdc";
import {
  isVoucherClaimedOnChain,
  readPublicPayoutConfig,
} from "@/lib/payoutContract";
import { payoutAmountWei, rankToTierLabel } from "@/lib/payoutTiers";
import { computeVoucherId } from "@/lib/payoutVoucher";
import { resolveSnapshotWinner } from "@/lib/resolveSnapshotWinner";
import { isSolanaVoucherClaimed } from "@/lib/solanaClaimMarker";
import {
  isSolanaPayoutEnabled,
} from "@/lib/solanaPayoutEpoch";
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
  /** BNB wei amount when using the legacy BNB rail. */
  bnb: number;
  /** USDC base units (6 decimals) when using the Solana rail. */
  usdc: number | null;
  /** Human-readable prize string for the Vault UI. */
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

  const solanaEnabled = isSolanaPayoutEnabled();
  const solanaConfig = solanaEnabled ? readSolanaPayoutConfig() : null;
  const solanaConnection =
    solanaConfig !== null
      ? new Connection(solanaConfig.rpcUrl, "confirmed")
      : null;
  const bnbConfig = solanaEnabled ? null : readPublicPayoutConfig();
  const rewards: ClaimableRewardDto[] = [];

  for (const epoch of epochs) {
    const epochId = BigInt(epoch.epoch_id);
    const snapshot = await resolveSnapshotWinner(epochId, session);
    if (!snapshot) continue;

    const potWei = parsePotWei(epoch.pot_wei);
    if (!potWei) continue;

    const amountWei = payoutAmountWei(potWei, snapshot.rank);
    if (!amountWei || amountWei <= 0n) continue;

    let claimed = false;
    if (solanaEnabled && solanaConfig && solanaConnection) {
      const onChainClaimed = await withTimeout(
        isSolanaVoucherClaimed(
          solanaConnection,
          solanaConfig.programId,
          epochId,
          snapshot.user_id,
        ),
        ON_CHAIN_READ_TIMEOUT_MS,
      );
      claimed = onChainClaimed ?? false;
    } else if (bnbConfig) {
      const voucherId = computeVoucherId(epochId, snapshot.user_id);
      const onChainClaimed = await withTimeout(
        isVoucherClaimedOnChain(bnbConfig, voucherId),
        ON_CHAIN_READ_TIMEOUT_MS,
      );
      claimed = onChainClaimed ?? false;
    }

    const { day, date } = formatEpochDayLabels(
      epochId,
      epoch.finalized_at as string,
    );

    const usdc = solanaEnabled
      ? Number(amountWei) / 10 ** USDC_DECIMALS
      : null;
    const bnb = solanaEnabled ? 0 : Number(amountWei) / 1e18;
    const prizeLabel = solanaEnabled
      ? `${formatUsdcFromBaseUnits(amountWei, { maxFractionDigits: 2 })} USDC`
      : bnb > 0
        ? `${bnb.toFixed(4)} pool share`
        : rankToTierLabel(snapshot.rank);

    rewards.push({
      id: String(epoch.epoch_id),
      epochId: String(epoch.epoch_id),
      rank: snapshot.rank,
      tier: rankToTierLabel(snapshot.rank),
      pts: snapshot.total_points,
      amountWei: amountWei.toString(),
      bnb,
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
