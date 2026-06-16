import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { getAvailableEpochPotWei } from "@/lib/payoutLiability";
import {
  ensureEpochOpenedOnChain,
  readOnChainEpoch,
  type EnsureEpochOpenResult,
} from "@/lib/payoutOpenEpoch";
import { syncPayoutEpochPotFromChain } from "@/lib/payoutEpochPot";

export type PayoutEpochRow = {
  epoch_id: number;
  pot_wei: string;
  pot_usd_cents: number | null;
  finalized_at: string | null;
  created_at: string;
};

const PAYOUT_EPOCH_COLUMNS =
  "epoch_id, pot_wei, pot_usd_cents, finalized_at, created_at" as const;
const PAYOUT_EPOCH_COLUMNS_LEGACY =
  "epoch_id, pot_wei, finalized_at, created_at" as const;

export async function getPayoutEpoch(
  epochId: bigint,
): Promise<PayoutEpochRow | null> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);

  let { data, error } = await supabase
    .from("payout_epochs")
    .select(PAYOUT_EPOCH_COLUMNS)
    .eq("epoch_id", epochNumeric)
    .maybeSingle();

  if (
    error?.message.includes("pot_usd_cents") &&
    error.message.includes("does not exist")
  ) {
    ({ data, error } = await supabase
      .from("payout_epochs")
      .select(PAYOUT_EPOCH_COLUMNS_LEGACY)
      .eq("epoch_id", epochNumeric)
      .maybeSingle());
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const row = data as PayoutEpochRow & { pot_usd_cents?: number | null };
  return {
    ...row,
    pot_usd_cents: row.pot_usd_cents ?? null,
  };
}

export async function upsertPayoutEpochPot(
  epochId: bigint,
  potWei: bigint,
): Promise<PayoutEpochRow> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);
  const now = new Date().toISOString();

  const existing = await getPayoutEpoch(epochId);
  if (existing?.finalized_at) {
    throw new Error(`Epoch ${epochNumeric} is already finalized`);
  }

  const { error } = await supabase.from("payout_epochs").upsert(
    {
      epoch_id: epochNumeric,
      pot_wei: potWei.toString(),
      ...(existing ? {} : { created_at: now }),
    },
    { onConflict: "epoch_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = await getPayoutEpoch(epochId);
  if (!row) {
    throw new Error(`Epoch ${epochNumeric} missing after upsert`);
  }

  return row;
}

/** Updates pot_wei to match on-chain openEpoch (even after finalize). */
export async function setPayoutEpochPotWei(
  epochId: bigint,
  potWei: bigint,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);

  const { error } = await supabase
    .from("payout_epochs")
    .update({ pot_wei: potWei.toString() })
    .eq("epoch_id", epochNumeric);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPayoutEpochFinalized(
  epochId: bigint,
  potUsdCents: number,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("payout_epochs")
    .update({ finalized_at: now, pot_usd_cents: potUsdCents })
    .eq("epoch_id", epochNumeric);

  if (error) {
    throw new Error(error.message);
  }
}

export function parsePotWei(raw: string | null | undefined): bigint | null {
  if (!raw?.trim()) return null;
  try {
    const value = BigInt(raw.trim());
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

/** True if any payout epoch was finalized on the given UTC calendar day. */
export async function hasFinalizedEpochForUtcDay(date: Date): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start.getTime() + 86_400_000);

  const { count, error } = await supabase
    .from("payout_epochs")
    .select("epoch_id", { count: "exact", head: true })
    .not("finalized_at", "is", null)
    .gte("finalized_at", start.toISOString())
    .lt("finalized_at", end.toISOString());

  if (error) {
    const detail =
      error.message?.trim() ||
      (error as { hint?: string }).hint?.trim() ||
      "unknown Supabase error (check SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL match the same project)";
    throw new Error(`Supabase payout_epochs query failed: ${detail}`);
  }

  return (count ?? 0) > 0;
}

export type EpochPotSyncMeta = {
  contractBalanceWei: string;
  reservedLiabilityWei: string;
  totalReservedOnChainWei: string;
  availablePotWei: string;
  epochOpenOnChain?: EnsureEpochOpenResult;
};

/**
 * Ensures today's epoch row with pot_wei = contract balance minus on-chain totalReserved.
 * Refreshes pot_wei on each snapshot run until the epoch is finalized.
 */
export async function ensurePayoutEpochForSnapshot(
  epochId: bigint,
): Promise<
  | {
      epoch: PayoutEpochRow;
      created: boolean;
      potSyncedFromContract: boolean;
      potSync?: EpochPotSyncMeta;
    }
  | { epoch: null; created: false; reason: string }
> {
  const existing = await getPayoutEpoch(epochId);
  if (existing?.finalized_at) {
    return { epoch: existing, created: false, potSyncedFromContract: false };
  }

  const available = await getAvailableEpochPotWei(epochId);
  if (!available) {
    return {
      epoch: null,
      created: false,
      reason:
        "Payout contract not configured (PAYOUT_CONTRACT_ADDRESS + PAYOUT_CHAIN_ID)",
    };
  }

  if (available.availablePotWei <= 0n) {
    const onChain = await readOnChainEpoch(epochId);
    const existingPot = existing ? parsePotWei(existing.pot_wei) : null;
    if (existing && existingPot && onChain?.open && onChain.pot > 0n) {
      let epoch = existing;
      if (existingPot !== onChain.pot) {
        await setPayoutEpochPotWei(epochId, onChain.pot);
        epoch = { ...existing, pot_wei: onChain.pot.toString() };
      }
      const epochOpenOnChain: EnsureEpochOpenResult = {
        status: "already_open",
        pot: onChain.pot,
      };
      const potSync: EpochPotSyncMeta = {
        contractBalanceWei: available.contractBalanceWei.toString(),
        reservedLiabilityWei: available.reservedLiabilityWei.toString(),
        totalReservedOnChainWei: available.totalReservedOnChainWei.toString(),
        availablePotWei: available.availablePotWei.toString(),
        epochOpenOnChain,
      };
      return {
        epoch,
        created: false,
        potSyncedFromContract: existingPot !== onChain.pot,
        potSync,
      };
    }

    const reservedOnChain = available.totalReservedOnChainWei.toString();
    const balance = available.contractBalanceWei.toString();
    return {
      epoch: null,
      created: false,
      reason:
        available.totalReservedOnChainWei > 0n
          ? `No new epoch pot — contract holds ${balance} wei with ${reservedOnChain} wei already reserved on-chain (fund more or wait for prior-day claims)`
          : "Payout contract has no BNB available for a new epoch — fund the contract before snapshot",
    };
  }

  const epoch = await upsertPayoutEpochPot(epochId, available.availablePotWei);
  const epochOpenOnChain = await ensureEpochOpenedOnChain(
    epochId,
    available.availablePotWei,
  );
  if (
    epochOpenOnChain.status === "opened" ||
    epochOpenOnChain.status === "already_open"
  ) {
    await syncPayoutEpochPotFromChain(epochId).catch(() => undefined);
  }
  const potSync: EpochPotSyncMeta = {
    contractBalanceWei: available.contractBalanceWei.toString(),
    reservedLiabilityWei: available.reservedLiabilityWei.toString(),
    totalReservedOnChainWei: available.totalReservedOnChainWei.toString(),
    availablePotWei: available.availablePotWei.toString(),
    epochOpenOnChain,
  };

  return {
    epoch,
    created: !existing,
    potSyncedFromContract: true,
    potSync,
  };
}
