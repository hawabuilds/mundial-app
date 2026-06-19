import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFixtureById, type Fixture } from "@/app/data/fixtures";
import { scorePrediction, type MatchScore } from "@/lib/scoring";
import {
  isReplyBeforeKickoff,
  loadEligiblePreKickoffPredictions,
} from "@/lib/predictionEligibility";

let client: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/** Supabase client expects the project URL only — not `/rest/v1/`. */
export function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!client) {
    client = createClient(normalizeSupabaseUrl(url), anonKey);
  }

  return client;
}

/** Service role bypasses RLS — set SUPABASE_SERVICE_ROLE_KEY for admin scripts. */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Settings → API → service_role)",
    );
  }

  if (!adminClient) {
    adminClient = createClient(normalizeSupabaseUrl(url), serviceKey);
  }

  return adminClient;
}

export type PredictionRow = {
  user_id: string;
  user_handle: string;
  match_id: number;
  home_score: number;
  away_score: number;
  points?: number | null;
  replied_at?: string | null;
};

export type MatchStateRow = {
  match_id: number;
  predictions_collected_at: string | null;
  scored_at: string | null;
  final_home_score: number | null;
  final_away_score: number | null;
  match_tweet_id: string | null;
  match_fixture_key: string | null;
  home_team: string | null;
  away_team: string | null;
  kickoff_at: string | null;
};

export async function savePrediction(row: PredictionRow): Promise<void> {
  if (!/^\d{1,20}$/.test(row.user_id.trim())) {
    throw new Error(
      `predictions.user_id must be X numeric author_id, got: ${row.user_id}`,
    );
  }

  const supabase = getSupabaseClient();

  const base = {
    user_id: row.user_id,
    user_handle: row.user_handle,
    match_id: row.match_id,
    home_score: row.home_score,
    away_score: row.away_score,
  };

  const withRepliedAt =
    row.replied_at != null ? { ...base, replied_at: row.replied_at } : base;

  let { error } = await supabase.from("predictions").upsert(withRepliedAt, {
    onConflict: "user_id,match_id",
  });

  if (
    error &&
    row.replied_at &&
    error.message.includes("replied_at")
  ) {
    ({ error } = await supabase.from("predictions").upsert(base, {
      onConflict: "user_id,match_id",
    }));
  }

  if (
    error &&
    (error.message.includes("ON CONFLICT") ||
      error.message.includes("unique or exclusion constraint") ||
      error.message.includes("predictions_pkey"))
  ) {
    throw new Error(
      "predictions must allow one row per user per match (primary key on user_id + match_id). " +
        "Run supabase/schema.sql in the Supabase SQL editor, then backfill earlier matches.",
    );
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function deletePredictionsForMatch(matchId: number): Promise<number> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("predictions")
    .delete()
    .eq("match_id", matchId)
    .select("user_id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

/** Clears collection/scoring flags so crons do not treat a voided match as done. */
export async function resetMatchCollection(matchId: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("match_state")
    .update({ predictions_collected_at: null })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
}

export async function resetMatchScoring(matchId: number): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: pointsError } = await supabase
    .from("predictions")
    .update({ points: null })
    .eq("match_id", matchId);

  if (pointsError) {
    throw new Error(pointsError.message);
  }

  const { error: stateError } = await supabase
    .from("match_state")
    .update({
      scored_at: null,
      final_home_score: null,
      final_away_score: null,
    })
    .eq("match_id", matchId);

  if (stateError) {
    throw new Error(stateError.message);
  }
}

export async function getStoredMatchTweetId(matchId: number): Promise<string | null> {
  const state = await getMatchState(matchId);
  return state?.match_tweet_id?.trim() || null;
}

export async function saveMatchTweetId(
  matchId: number,
  tweetId: string,
  fixtureKey?: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const existing = await getMatchState(matchId);
  const payload = {
    match_tweet_id: tweetId,
    match_fixture_key: fixtureKey ?? null,
  };

  if (existing) {
    const { error } = await supabase
      .from("match_state")
      .update(payload)
      .eq("match_id", matchId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("match_state").insert({
    match_id: matchId,
    ...payload,
  });

  if (error) throw new Error(error.message);
}

export async function clearMatchTweetId(matchId: number): Promise<void> {
  const supabase = getSupabaseClient();
  const existing = await getMatchState(matchId);
  if (!existing?.match_tweet_id && !existing?.match_fixture_key) return;

  const { error } = await supabase
    .from("match_state")
    .update({ match_tweet_id: null, match_fixture_key: null })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
}

export async function getMatchState(matchId: number): Promise<MatchStateRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("match_state")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as MatchStateRow | null;
}

export async function markMatchCollected(matchId: number): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const existing = await getMatchState(matchId);

  if (existing) {
    const { error } = await supabase
      .from("match_state")
      .update({ predictions_collected_at: now })
      .eq("match_id", matchId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("match_state").insert({
    match_id: matchId,
    predictions_collected_at: now,
  });

  if (error) throw new Error(error.message);
}

export async function isMatchCollected(matchId: number): Promise<boolean> {
  const state = await getMatchState(matchId);
  return Boolean(state?.predictions_collected_at);
}

export async function countPredictionsForMatch(matchId: number): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** True when collection finished and at least one prediction row exists. */
export async function isEffectivelyCollected(matchId: number): Promise<boolean> {
  const state = await getMatchState(matchId);
  if (!state?.predictions_collected_at) return false;
  return (await countPredictionsForMatch(matchId)) > 0;
}

export type ScoredPrediction = {
  user_id: string;
  user_handle: string;
  home_score: number;
  away_score: number;
  points: number;
};

export type ScoreMatchResult = {
  matchId: number;
  finalScore: MatchScore;
  predictionsScored: number;
  breakdown: {
    exact: number;
    outcome: number;
    participation: number;
  };
};

async function scoreStoredPredictionsOnly(
  supabase: SupabaseClient,
  matchId: number,
  fixture: Fixture,
  finalScore: MatchScore,
  predictions: Array<{
    user_id: string;
    user_handle: string;
    home_score: number;
    away_score: number;
    replied_at?: string | null;
  }>,
): Promise<Pick<ScoreMatchResult, "predictionsScored" | "breakdown">> {
  const breakdown = { exact: 0, outcome: 0, participation: 0 };
  let predictionsScored = 0;

  const updates = predictions.map(async (row) => {
    if (
      row.replied_at &&
      !isReplyBeforeKickoff(row.replied_at, fixture)
    ) {
      const { error: clearError } = await supabase
        .from("predictions")
        .update({ points: null })
        .eq("user_id", row.user_id)
        .eq("match_id", matchId);

      if (clearError) throw new Error(clearError.message);
      return null;
    }

    const points = scorePrediction(
      { homeScore: row.home_score, awayScore: row.away_score },
      finalScore,
    );

    const { error: updateError } = await supabase
      .from("predictions")
      .update({ points })
      .eq("user_id", row.user_id)
      .eq("match_id", matchId);

    if (updateError) throw new Error(updateError.message);
    return points;
  });

  for (const points of await Promise.all(updates)) {
    if (points === null) continue;
    if (points === 5) breakdown.exact += 1;
    else if (points === 3) breakdown.outcome += 1;
    else breakdown.participation += 1;
    predictionsScored += 1;
  }

  return { predictionsScored, breakdown };
}

async function persistMatchFinalScore(
  supabase: SupabaseClient,
  matchId: number,
  finalScore: MatchScore,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getMatchState(matchId);
  const payload = {
    scored_at: now,
    final_home_score: finalScore.homeScore,
    final_away_score: finalScore.awayScore,
  };

  if (existing) {
    const { error } = await supabase
      .from("match_state")
      .update(payload)
      .eq("match_id", matchId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("match_state").insert({
    match_id: matchId,
    ...payload,
  });
  if (error) throw new Error(error.message);
}

export async function scoreMatchPredictions(
  matchId: number,
  finalScore: MatchScore,
  fixtureOverride?: Fixture,
): Promise<ScoreMatchResult> {
  const supabase = getSupabaseClient();
  const fixture = fixtureOverride ?? getFixtureById(matchId);

  if (!fixture) {
    throw new Error(`Unknown matchId: ${matchId}`);
  }

  const matchState = await getMatchState(matchId);

  const { data: predictions, error: fetchError } = await supabase
    .from("predictions")
    .select("user_id, user_handle, home_score, away_score, replied_at")
    .eq("match_id", matchId);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (matchState?.predictions_collected_at) {
    const { predictionsScored, breakdown } = await scoreStoredPredictionsOnly(
      supabase,
      matchId,
      fixture,
      finalScore,
      predictions ?? [],
    );

    await persistMatchFinalScore(supabase, matchId, finalScore);

    return {
      matchId,
      finalScore,
      predictionsScored,
      breakdown,
    };
  }

  // API auto-settle before X collection: record FT now; rescore when replies arrive.
  if ((predictions ?? []).length === 0) {
    await persistMatchFinalScore(supabase, matchId, finalScore);
    return {
      matchId,
      finalScore,
      predictionsScored: 0,
      breakdown: { exact: 0, outcome: 0, participation: 0 },
    };
  }

  const eligible = await loadEligiblePreKickoffPredictions(fixture);

  const breakdown = { exact: 0, outcome: 0, participation: 0 };
  let predictionsScored = 0;

  for (const row of predictions ?? []) {
    const eligiblePrediction = eligible.get(row.user_id);

    if (!eligiblePrediction) {
      const { error: clearError } = await supabase
        .from("predictions")
        .update({ points: null })
        .eq("user_id", row.user_id)
        .eq("match_id", matchId);

      if (clearError) {
        throw new Error(clearError.message);
      }
      continue;
    }

    const points = scorePrediction(
      {
        homeScore: eligiblePrediction.homeScore,
        awayScore: eligiblePrediction.awayScore,
      },
      finalScore,
    );

    if (points === 5) breakdown.exact += 1;
    else if (points === 3) breakdown.outcome += 1;
    else breakdown.participation += 1;

    const scoreUpdate: Record<string, unknown> = {
      points,
      home_score: eligiblePrediction.homeScore,
      away_score: eligiblePrediction.awayScore,
      user_handle: eligiblePrediction.userHandle,
    };

    let { error: updateError } = await supabase
      .from("predictions")
      .update({ ...scoreUpdate, replied_at: eligiblePrediction.repliedAt })
      .eq("user_id", row.user_id)
      .eq("match_id", matchId);

    if (updateError?.message.includes("replied_at")) {
      ({ error: updateError } = await supabase
        .from("predictions")
        .update(scoreUpdate)
        .eq("user_id", row.user_id)
        .eq("match_id", matchId));
    }

    if (updateError) {
      throw new Error(updateError.message);
    }

    predictionsScored += 1;
  }

  for (const eligiblePrediction of eligible.values()) {
    const alreadyStored = predictions?.some(
      (row) => row.user_id === eligiblePrediction.userId,
    );
    if (alreadyStored) continue;

    await savePrediction({
      user_id: eligiblePrediction.userId,
      user_handle: eligiblePrediction.userHandle,
      match_id: matchId,
      home_score: eligiblePrediction.homeScore,
      away_score: eligiblePrediction.awayScore,
      replied_at: eligiblePrediction.repliedAt,
    });

    const points = scorePrediction(
      {
        homeScore: eligiblePrediction.homeScore,
        awayScore: eligiblePrediction.awayScore,
      },
      finalScore,
    );

    if (points === 5) breakdown.exact += 1;
    else if (points === 3) breakdown.outcome += 1;
    else breakdown.participation += 1;

    const { error: updateError } = await supabase
      .from("predictions")
      .update({ points })
      .eq("user_id", eligiblePrediction.userId)
      .eq("match_id", matchId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    predictionsScored += 1;
  }

  await persistMatchFinalScore(supabase, matchId, finalScore);

  return {
    matchId,
    finalScore,
    predictionsScored,
    breakdown,
  };
}

export async function isMatchScored(matchId: number): Promise<boolean> {
  const state = await getMatchState(matchId);
  return Boolean(state?.scored_at);
}

/** Award points when predictions were collected after an API auto-score. */
export async function rescoreCollectedMatch(
  matchId: number,
): Promise<ScoreMatchResult | null> {
  const state = await getMatchState(matchId);
  if (
    !state?.scored_at ||
    !state.predictions_collected_at ||
    state.final_home_score == null ||
    state.final_away_score == null
  ) {
    return null;
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) return null;

  const finalScore: MatchScore = {
    homeScore: state.final_home_score,
    awayScore: state.final_away_score,
  };

  return scoreMatchPredictions(matchId, finalScore, fixture);
}

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  user_handle: string;
  total_points: number;
};

export async function getLeaderboard(limit?: number): Promise<LeaderboardEntry[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("predictions")
    .select("user_id, user_handle, match_id, points, replied_at")
    .not("points", "is", null);

  if (error?.message.includes("replied_at")) {
    const fallback = await supabase
      .from("predictions")
      .select("user_id, user_handle, match_id, points")
      .not("points", "is", null);

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return rankLeaderboardRows(
      (fallback.data ?? []).map((row) => ({ ...row, replied_at: null })),
      limit,
    );
  }

  if (error) {
    throw new Error(error.message);
  }

  return rankLeaderboardRows(data ?? [], limit);
}

function rankLeaderboardRows(
  rows: Array<{
    user_id: string;
    user_handle: string;
    match_id?: number;
    points: number | null;
    replied_at?: string | null;
  }>,
  limit?: number,
): LeaderboardEntry[] {
  const totals = new Map<
    string,
    {
      user_id: string;
      user_handle: string;
      total_points: number;
      earliest_reply: string | null;
    }
  >();

  for (const row of rows) {
    if (row.points === null || row.points === undefined) continue;

    const existing = totals.get(row.user_id);
    if (existing) {
      existing.total_points += row.points;
      existing.user_handle = row.user_handle;
      if (
        row.replied_at &&
        (!existing.earliest_reply || row.replied_at < existing.earliest_reply)
      ) {
        existing.earliest_reply = row.replied_at;
      }
    } else {
      totals.set(row.user_id, {
        user_id: row.user_id,
        user_handle: row.user_handle,
        total_points: row.points,
        earliest_reply: row.replied_at ?? null,
      });
    }
  }

  const sorted = [...totals.values()].sort(
    (a, b) =>
      b.total_points - a.total_points ||
      (a.earliest_reply ?? "9999").localeCompare(b.earliest_reply ?? "9999") ||
      a.user_handle.localeCompare(b.user_handle),
  );

  const ranked = sorted.map((entry, index) => ({
    rank: index + 1,
    user_id: entry.user_id,
    user_handle: entry.user_handle,
    total_points: entry.total_points,
  }));

  return limit ? ranked.slice(0, limit) : ranked;
}
