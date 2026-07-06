import { getSupabaseAdminClient } from "@/app/lib/supabase";

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
