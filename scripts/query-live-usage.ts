import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "../app/lib/supabase";

async function countTable(
  table: string,
  filter?: { column: string; op: string; value: string },
) {
  const supabase = getSupabaseAdminClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = q.filter(filter.column, filter.op, filter.value);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const supabase = getSupabaseAdminClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const predictions = await countTable("predictions");
  const scoredMatches = await countTable("match_state", {
    column: "scored_at",
    op: "not.is",
    value: "null",
  });
  const proofs = await countTable("match_proofs");
  const goalEvents = await countTable("match_goals");

  const { count: verifiedProofs } = await supabase
    .from("match_proofs")
    .select("*", { count: "exact", head: true })
    .eq("show_verified_badge", true);

  const { data: withPoints } = await supabase
    .from("predictions")
    .select("user_id, points")
    .gt("points", 0);
  const distinctWithPoints = new Set(
    (withPoints ?? []).map((r) => r.user_id),
  ).size;
  const totalPointsAwarded = (withPoints ?? []).reduce(
    (sum, row) => sum + Number(row.points ?? 0),
    0,
  );
  const pointsByUser = new Map<string, number>();
  for (const row of withPoints ?? []) {
    const id = String(row.user_id);
    pointsByUser.set(id, (pointsByUser.get(id) ?? 0) + Number(row.points ?? 0));
  }
  const topScore = Math.max(0, ...pointsByUser.values());

  const { count: epochCount } = await supabase
    .from("payout_epochs")
    .select("*", { count: "exact", head: true });

  let claimsCount: number | null = null;
  let claimsError: string | null = null;
  const claimsRes = await supabase
    .from("solana_claims")
    .select("*", { count: "exact", head: true });
  if (claimsRes.error) {
    claimsError = claimsRes.error.message;
  } else {
    claimsCount = claimsRes.count ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        queriedAt: new Date().toISOString(),
        supabaseUrl,
        supabaseHost: supabaseUrl
          ? new URL(supabaseUrl).hostname
          : null,
        predictions,
        distinctPlayersWithPoints: distinctWithPoints,
        topScore,
        totalPointsAwarded,
        matchesSettledViaTxline: scoredMatches,
        proofsInMatchProofs: proofs,
        proofsWithVerifiedBadge: verifiedProofs ?? 0,
        goalEventsInMatchGoals: goalEvents,
        payoutEpochs: epochCount ?? 0,
        solanaClaims: claimsCount,
        solanaClaimsError: claimsError,
      },
      null,
      2,
    ),
  );
}

void main();
