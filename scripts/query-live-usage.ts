import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "../app/lib/supabase";

async function countTable(table: string, filter?: { column: string; op: string; value: string }) {
  const supabase = getSupabaseAdminClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = q.filter(filter.column, filter.op, filter.value);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const supabase = getSupabaseAdminClient();

  const predictions = await countTable("predictions");
  const scoredMatches = await countTable("match_state", {
    column: "scored_at",
    op: "not.is",
    value: "null",
  });
  const proofs = await countTable("match_proofs");

  const { count: verifiedProofs } = await supabase
    .from("match_proofs")
    .select("*", { count: "exact", head: true })
    .eq("show_verified_badge", true);

  const { data: withPoints } = await supabase
    .from("predictions")
    .select("user_id, points")
    .gt("points", 0);
  const distinctWithPoints = new Set((withPoints ?? []).map((r) => r.user_id)).size;

  const { count: epochCount } = await supabase
    .from("payout_epochs")
    .select("*", { count: "exact", head: true });

  console.log(
    JSON.stringify(
      {
        queriedAt: new Date().toISOString(),
        predictions,
        distinctPlayersWithPoints: distinctWithPoints,
        matchesSettledViaTxline: scoredMatches,
        proofsInMatchProofs: proofs,
        proofsWithVerifiedBadge: verifiedProofs ?? 0,
        payoutEpochs: epochCount ?? 0,
      },
      null,
      2,
    ),
  );
}

void main();
