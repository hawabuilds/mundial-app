import { config } from "dotenv";
config({ path: ".env.local" });
import { getSupabaseAdminClient } from "../app/lib/supabase";

async function main() {
  const sb = getSupabaseAdminClient();
  const epochs = process.argv.slice(2).map(Number).filter(Boolean);
  const list = epochs.length ? epochs : [20260527, 20260528, 20260529, 20260530, 20260531, 20260601];
  for (const e of list) {
    const { count } = await sb
      .from("leaderboard_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("epoch_id", e);
    const { data: pe } = await sb
      .from("payout_epochs")
      .select("finalized_at, pot_wei")
      .eq("epoch_id", e)
      .maybeSingle();
    console.log(e, "snapshots", count ?? 0, "payout_epochs", pe ?? "none");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
