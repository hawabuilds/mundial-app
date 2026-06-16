import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { getLeaderboard } from "../app/lib/supabase";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: preds } = await sb
    .from("predictions")
    .select("user_id,user_handle,match_id,points")
    .order("match_id");

  const { data: snaps } = await sb
    .from("leaderboard_snapshots")
    .select("epoch_id,user_id,user_handle,rank,total_points")
    .order("epoch_id")
    .order("rank");

  const leaderboard = await getLeaderboard(25);

  console.log("=== session reference (hawadoteth numeric id) ===");
  console.log("3120013892");

  console.log("\n=== predictions.user_id samples ===");
  for (const row of preds ?? []) {
    console.log({
      user_id: row.user_id,
      user_handle: row.user_handle,
      match_id: row.match_id,
      looksNumeric: /^\d+$/.test(row.user_id),
    });
  }

  console.log("\n=== getLeaderboard() top rows ===");
  for (const row of leaderboard.slice(0, 10)) {
    console.log({
      user_id: row.user_id,
      user_handle: row.user_handle,
      rank: row.rank,
      looksNumeric: /^\d+$/.test(row.user_id),
    });
  }

  console.log("\n=== leaderboard_snapshots ===");
  for (const row of snaps ?? []) {
    console.log({
      epoch_id: row.epoch_id,
      user_id: row.user_id,
      user_handle: row.user_handle,
      rank: row.rank,
      looksNumeric: /^\d+$/.test(row.user_id),
    });
  }
}

main().catch(console.error);
