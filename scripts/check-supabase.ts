import { config } from "dotenv";
config({ path: ".env.local" });
import { getSupabaseAdminClient } from "../app/lib/supabase";

async function main() {
  const supabase = getSupabaseAdminClient();
  const r1 = await supabase.from("leaderboard_snapshots").select("epoch_id", { count: "exact", head: true });
  console.log("snapshots", JSON.stringify(r1, null, 2));
  const r2 = await supabase.from("payout_epochs").select("epoch_id, finalized_at").order("epoch_id", { ascending: false }).limit(5);
  console.log("epochs", JSON.stringify(r2, null, 2));
}
main().catch(console.error);
