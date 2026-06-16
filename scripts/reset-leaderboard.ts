import { config } from "dotenv";
config({ path: ".env.local" });

import {
  getSupabaseAdminClient,
  getSupabaseClient,
  getLeaderboard,
} from "../app/lib/supabase";

async function clearMatchState(useAdmin: boolean): Promise<number> {
  const supabase = useAdmin ? getSupabaseAdminClient() : getSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("match_state")
    .select("match_id");

  if (fetchError) throw new Error(`match_state: ${fetchError.message}`);
  if (!existing?.length) return 0;

  let cleared = 0;
  for (const row of existing) {
    const { data: deleted, error: deleteError } = await supabase
      .from("match_state")
      .delete()
      .eq("match_id", row.match_id)
      .select("match_id");

    if (!deleteError && (deleted?.length ?? 0) > 0) {
      cleared += 1;
      continue;
    }

    const { data: reset, error: resetError } = await supabase
      .from("match_state")
      .update({
        predictions_collected_at: null,
        scored_at: null,
        final_home_score: null,
        final_away_score: null,
        match_tweet_id: null,
      })
      .eq("match_id", row.match_id)
      .select("match_id");

    if (resetError || !reset?.length) {
      throw new Error(
        `match_state ${row.match_id}: could not delete or reset`,
      );
    }

    cleared += 1;
  }

  return cleared;
}

async function clearPredictions(useAdmin: boolean): Promise<number> {
  const supabase = useAdmin ? getSupabaseAdminClient() : getSupabaseClient();
  const { data, error } = await supabase
    .from("predictions")
    .delete()
    .neq("user_id", "")
    .select("user_id");

  if (error) throw new Error(`predictions: ${error.message}`);
  return data?.length ?? 0;
}

async function clearLeaderboardSnapshots(useAdmin: boolean): Promise<number> {
  const supabase = useAdmin ? getSupabaseAdminClient() : getSupabaseClient();
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .delete()
    .gte("epoch_id", 0)
    .select("epoch_id");

  if (error) throw new Error(`leaderboard_snapshots: ${error.message}`);
  return data?.length ?? 0;
}

async function main() {
  const hasAdmin = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  console.log("Leaderboard before:", await getLeaderboard());

  const predictionsDeleted = await clearPredictions(hasAdmin);
  const matchStateCleared = await clearMatchState(hasAdmin);
  const snapshotsDeleted = await clearLeaderboardSnapshots(hasAdmin);

  console.log(`Cleared ${predictionsDeleted} prediction row(s).`);
  console.log(`Cleared ${matchStateCleared} match_state row(s).`);
  console.log(`Cleared ${snapshotsDeleted} leaderboard_snapshot row(s).`);
  console.log("Leaderboard after:", await getLeaderboard());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
