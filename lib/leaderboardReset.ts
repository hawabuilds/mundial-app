import {
  getSupabaseAdminClient,
  getLeaderboard,
  type LeaderboardEntry,
} from "@/app/lib/supabase";

export type LeaderboardResetResult = {
  predictionsDeleted: number;
  snapshotsDeleted: number;
  matchStateReset: number;
  leaderboardBefore: LeaderboardEntry[];
  leaderboardAfter: LeaderboardEntry[];
};

async function clearPredictions(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("predictions")
    .select("*", { count: "exact", head: true });

  if (countError) throw new Error(`predictions count: ${countError.message}`);

  const { error } = await supabase.from("predictions").delete().gte("match_id", 0);
  if (error) throw new Error(`predictions: ${error.message}`);

  return count ?? 0;
}

async function clearLeaderboardSnapshots(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("leaderboard_snapshots")
    .select("*", { count: "exact", head: true });

  if (countError) throw new Error(`leaderboard_snapshots count: ${countError.message}`);

  const { error } = await supabase
    .from("leaderboard_snapshots")
    .delete()
    .gte("epoch_id", 0);

  if (error) throw new Error(`leaderboard_snapshots: ${error.message}`);

  return count ?? 0;
}

async function resetMatchStateScores(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("match_state")
    .select("match_id");

  if (fetchError) throw new Error(`match_state: ${fetchError.message}`);
  if (!existing?.length) return 0;

  let reset = 0;
  for (const row of existing) {
    const { data: deleted, error: deleteError } = await supabase
      .from("match_state")
      .delete()
      .eq("match_id", row.match_id)
      .select("match_id");

    if (!deleteError && (deleted?.length ?? 0) > 0) {
      reset += 1;
      continue;
    }

    const { data: updated, error: resetError } = await supabase
      .from("match_state")
      .update({
        predictions_collected_at: null,
        scored_at: null,
        final_home_score: null,
        final_away_score: null,
        match_tweet_id: null,
        match_fixture_key: null,
      })
      .eq("match_id", row.match_id)
      .select("match_id");

    if (resetError || !updated?.length) {
      throw new Error(`match_state ${row.match_id}: could not delete or reset`);
    }

    reset += 1;
  }

  return reset;
}

/** Wipe scored predictions and snapshots so the live leaderboard starts fresh. */
export async function resetLeaderboardData(): Promise<LeaderboardResetResult> {
  const leaderboardBefore = await getLeaderboard();

  const predictionsDeleted = await clearPredictions();
  const snapshotsDeleted = await clearLeaderboardSnapshots();
  const matchStateReset = await resetMatchStateScores();

  const leaderboardAfter = await getLeaderboard();

  return {
    predictionsDeleted,
    snapshotsDeleted,
    matchStateReset,
    leaderboardBefore,
    leaderboardAfter,
  };
}
