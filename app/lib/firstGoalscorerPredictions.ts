import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { isTwitterNumericUserId } from "@/lib/twitterUserId";

export type FirstGoalscorerPredictionRow = {
  user_id: string;
  match_id: number;
  user_handle: string;
  player_id: number | null;
  player_name: string;
  player_side: "home" | "away";
  predicted_at: string;
};

export type ScorePredictionRow = {
  user_id: string;
  match_id: number;
  home_score: number;
  away_score: number;
  user_handle: string;
};

export async function getScorePredictionForUser(
  userId: string,
  matchId: number,
): Promise<ScorePredictionRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("user_id, match_id, home_score, away_score, user_handle")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as ScorePredictionRow;
}

export async function getFirstGoalscorerPredictionForUser(
  userId: string,
  matchId: number,
): Promise<FirstGoalscorerPredictionRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("first_goalscorer_predictions")
    .select(
      "user_id, match_id, user_handle, player_id, player_name, player_side, predicted_at",
    )
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as FirstGoalscorerPredictionRow;
}

export async function saveFirstGoalscorerPrediction(input: {
  user_id: string;
  user_handle: string;
  match_id: number;
  player_id: number | null;
  player_name: string;
  player_side: "home" | "away";
  predicted_at?: string;
}): Promise<FirstGoalscorerPredictionRow> {
  if (!isTwitterNumericUserId(input.user_id)) {
    throw new Error(
      `first_goalscorer_predictions.user_id must be X numeric author_id, got: ${input.user_id}`,
    );
  }

  const name = input.player_name.trim();
  if (!name) {
    throw new Error("player_name is required");
  }

  const supabase = getSupabaseAdminClient();
  const row = {
    user_id: input.user_id,
    user_handle: input.user_handle,
    match_id: input.match_id,
    player_id: input.player_id,
    player_name: name,
    player_side: input.player_side,
    predicted_at: input.predicted_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("first_goalscorer_predictions")
    .upsert(row, { onConflict: "user_id,match_id" })
    .select(
      "user_id, match_id, user_handle, player_id, player_name, player_side, predicted_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return data as FirstGoalscorerPredictionRow;
}

export async function listUpcomingFirstGoalscorerOpportunities(
  userId: string,
  matchIds: number[],
): Promise<
  Array<{
    match_id: number;
    hasScorePrediction: boolean;
    hasFirstGoalscorerPrediction: boolean;
  }>
> {
  if (matchIds.length === 0) return [];

  const supabase = getSupabaseAdminClient();
  const [{ data: scores, error: scoreErr }, { data: picks, error: pickErr }] =
    await Promise.all([
      supabase
        .from("predictions")
        .select("match_id")
        .eq("user_id", userId)
        .in("match_id", matchIds),
      supabase
        .from("first_goalscorer_predictions")
        .select("match_id")
        .eq("user_id", userId)
        .in("match_id", matchIds),
    ]);

  if (scoreErr) throw new Error(scoreErr.message);
  if (pickErr) throw new Error(pickErr.message);

  const scoreSet = new Set((scores ?? []).map((row) => Number(row.match_id)));
  const pickSet = new Set((picks ?? []).map((row) => Number(row.match_id)));

  return matchIds.map((matchId) => ({
    match_id: matchId,
    hasScorePrediction: scoreSet.has(matchId),
    hasFirstGoalscorerPrediction: pickSet.has(matchId),
  }));
}

export async function listFirstGoalscorerPredictionsForMatch(
  matchId: number,
): Promise<FirstGoalscorerPredictionRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("first_goalscorer_predictions")
    .select(
      "user_id, match_id, user_handle, player_id, player_name, player_side, predicted_at",
    )
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
  return (data ?? []) as FirstGoalscorerPredictionRow[];
}
