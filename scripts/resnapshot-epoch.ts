import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { snapshotEpochLeaderboard } from "../lib/snapshotEpoch";

const EPOCH_ID = 20260529;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: preds } = await sb.from("predictions").select("user_id,user_handle");

  const nonNumeric = (preds ?? []).filter(
    (row) => !/^\d{1,20}$/.test(row.user_id),
  );

  if (nonNumeric.length > 0) {
    console.error("Non-numeric predictions.user_id rows:");
    console.error(JSON.stringify(nonNumeric, null, 2));
    console.error("Fix these before re-snapshotting.");
    process.exit(1);
  }

  console.log("All predictions.user_id values are numeric X ids.");

  await sb
    .from("leaderboard_snapshots")
    .delete()
    .eq("epoch_id", EPOCH_ID);

  await sb
    .from("payout_epochs")
    .update({ finalized_at: null, pot_usd_cents: null })
    .eq("epoch_id", EPOCH_ID);

  console.log(`Cleared snapshot + finalization for epoch ${EPOCH_ID}.`);

  const result = await snapshotEpochLeaderboard(
    new Date("2026-05-29T12:00:00Z"),
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
