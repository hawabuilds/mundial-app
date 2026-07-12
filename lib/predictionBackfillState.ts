import { getSupabaseAdminClient } from "@/app/lib/supabase";
import {
  PREDICTION_BACKFILL_TARGETS,
  type PredictionBackfillTarget,
} from "@/lib/predictionBackfillTargets";

export type BackfillStatus = "pending" | "done" | "abandoned";

export type PredictionBackfillRow = {
  match_id: number;
  tweet_id: string;
  home_team: string | null;
  away_team: string | null;
  status: BackfillStatus;
  attempts: number;
  started_at: string;
  last_attempt_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  last_result: Record<string, unknown> | null;
};

function isMissingTableError(message: string): boolean {
  return (
    message.includes("does not exist") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache")
  );
}

/** Insert known targets if absent — first cron tick seeds pending state. */
export async function ensurePredictionBackfillRows(): Promise<
  PredictionBackfillRow[]
> {
  const supabase = getSupabaseAdminClient();

  for (const target of PREDICTION_BACKFILL_TARGETS) {
    const { error } = await supabase.from("prediction_backfill").upsert(
      {
        match_id: target.matchId,
        tweet_id: target.tweetId,
        home_team: target.home,
        away_team: target.away,
        status: "pending",
      },
      {
        onConflict: "match_id",
        ignoreDuplicates: true,
      },
    );

    if (error) {
      if (isMissingTableError(error.message)) {
        throw new Error(
          "prediction_backfill table missing — run migration 20260712100000_prediction_backfill.sql",
        );
      }
      throw new Error(error.message);
    }
  }

  return listPredictionBackfillRows();
}

export async function listPredictionBackfillRows(): Promise<
  PredictionBackfillRow[]
> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prediction_backfill")
    .select(
      "match_id, tweet_id, home_team, away_team, status, attempts, started_at, last_attempt_at, completed_at, last_error, last_result",
    )
    .order("match_id", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) {
      throw new Error(
        "prediction_backfill table missing — run migration 20260712100000_prediction_backfill.sql",
      );
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    match_id: Number(row.match_id),
    tweet_id: String(row.tweet_id),
    home_team: (row.home_team as string | null) ?? null,
    away_team: (row.away_team as string | null) ?? null,
    status: row.status as BackfillStatus,
    attempts: Number(row.attempts ?? 0),
    started_at: String(row.started_at),
    last_attempt_at: (row.last_attempt_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    last_error: (row.last_error as string | null) ?? null,
    last_result: (row.last_result as Record<string, unknown> | null) ?? null,
  }));
}

export async function bumpBackfillAttempt(
  matchId: number,
  patch: {
    status?: BackfillStatus;
    lastError?: string | null;
    lastResult?: Record<string, unknown> | null;
    completed?: boolean;
  },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("prediction_backfill")
    .select("attempts")
    .eq("match_id", matchId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  const attempts = Number(existing?.attempts ?? 0) + 1;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("prediction_backfill")
    .update({
      attempts,
      last_attempt_at: now,
      status: patch.status ?? "pending",
      last_error: patch.lastError ?? null,
      last_result: patch.lastResult ?? null,
      ...(patch.completed
        ? { completed_at: now }
        : {}),
    })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
}

export function targetForMatch(
  matchId: number,
): PredictionBackfillTarget | undefined {
  return PREDICTION_BACKFILL_TARGETS.find((t) => t.matchId === matchId);
}
