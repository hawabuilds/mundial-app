import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { postTweetAsUser, readXUserOAuth1Credentials } from "@/lib/xPostTweet";

/** No URL entities — keeps X write cost at plain-text rate; real links live in bio. */
export const PREDICTION_REPLY_BOT_MESSAGE =
  "Nice pick — track your prediction and climb the leaderboard on our site (link in @copamundialapp bio). Community invite is there too";

const TABLE = "prediction_bot_replies";

export type PredictionBotReplyStatus =
  | "pending"
  | "sent"
  | "skipped"
  | "failed";

export type PredictionBotEnqueueInput = {
  matchId: number;
  userId: string;
  userHandle: string;
  sourceTweetId: string;
};

export type PredictionBotProcessResult = {
  enabled: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  stoppedReason?: string;
};

function isMissingTableError(message: string): boolean {
  return (
    message.includes("does not exist") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache")
  );
}

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null || raw === "") return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Kill switch — defaults OFF. */
export function isPredictionReplyBotEnabled(): boolean {
  return envFlag("X_REPLY_BOT_ENABLED", false);
}

/** When true, only users with no prior predictions get a bot reply. */
export function isPredictionReplyBotFirstTimeOnly(): boolean {
  return envFlag("X_REPLY_BOT_FIRST_TIME_ONLY", false);
}

/**
 * Optional emergency throttle. Default unlimited (flush all pending each cron).
 * Set X_REPLY_BOT_MAX_PER_RUN to a positive int to re-enable a hard cap.
 */
export function predictionReplyBotMaxPerRun(): number | null {
  const raw = process.env.X_REPLY_BOT_MAX_PER_RUN?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function predictionReplyBotMinGapMs(): number {
  return envInt("X_REPLY_BOT_MIN_GAP_MS", 8_000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function hasPriorPredictions(
  userId: string,
  excludeMatchId: number,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("predictions")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("match_id", excludeMatchId);

  if (error) {
    console.warn(
      `[reply-bot] prior-prediction check failed for ${userId}: ${error.message}`,
    );
    return false;
  }
  return (count ?? 0) > 0;
}

export async function predictionAlreadyExists(
  userId: string,
  matchId: number,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("user_id")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    console.warn(
      `[reply-bot] prediction exists check failed: ${error.message}`,
    );
    return true; // fail closed — don't enqueue if unsure
  }
  return Boolean(data);
}

/** Queue a once-per-user-per-match bot reply (no-op if already queued/sent). */
export async function enqueuePredictionBotReply(
  input: PredictionBotEnqueueInput,
): Promise<"queued" | "exists" | "skipped" | "error"> {
  if (!isPredictionReplyBotEnabled()) return "skipped";

  if (isPredictionReplyBotFirstTimeOnly()) {
    if (await hasPriorPredictions(input.userId, input.matchId)) {
      console.log(
        `[reply-bot] skipped @${input.userHandle.replace(/^@/, "")} match ${input.matchId}: not first-time predictor`,
      );
      return "skipped";
    }
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from(TABLE).insert({
    match_id: input.matchId,
    user_id: input.userId,
    user_handle: input.userHandle,
    source_tweet_id: input.sourceTweetId,
    status: "pending",
  });

  if (!error) {
    console.log(
      `[reply-bot] queued @${input.userHandle.replace(/^@/, "")} match ${input.matchId}`,
    );
    return "queued";
  }

  if (error.code === "23505" || /duplicate key/i.test(error.message)) {
    return "exists";
  }

  if (isMissingTableError(error.message)) {
    console.warn(
      `[reply-bot] ${TABLE} missing — run migration 20260713120000_prediction_bot_replies.sql`,
    );
    return "error";
  }

  console.warn(`[reply-bot] enqueue failed: ${error.message}`);
  return "error";
}

async function markReply(
  matchId: number,
  userId: string,
  patch: {
    status: PredictionBotReplyStatus;
    botTweetId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: patch.status,
      bot_tweet_id: patch.botTweetId ?? null,
      error: patch.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("match_id", matchId)
    .eq("user_id", userId);

  if (error && !isMissingTableError(error.message)) {
    console.warn(`[reply-bot] mark ${patch.status} failed: ${error.message}`);
  }
}

type PendingRow = {
  match_id: number;
  user_id: string;
  user_handle: string | null;
  source_tweet_id: string;
};

/**
 * Drain pending bot replies with conservative throttling.
 * Never throws — logs and returns on API / rate-limit failures.
 */
export async function processPredictionBotReplies(options?: {
  matchId?: number;
}): Promise<PredictionBotProcessResult> {
  const empty: PredictionBotProcessResult = {
    enabled: false,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  if (!isPredictionReplyBotEnabled()) {
    return empty;
  }

  if (!readXUserOAuth1Credentials()) {
    console.warn(
      "[reply-bot] enabled but write credentials missing — skipping (set X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET)",
    );
    return {
      ...empty,
      enabled: true,
      stoppedReason: "missing_write_credentials",
    };
  }

  const maxPerRun = predictionReplyBotMaxPerRun();
  const minGapMs = predictionReplyBotMinGapMs();
  // Safety ceiling when uncapped so a single query stays bounded.
  const loadLimit = maxPerRun ?? 1_000;

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from(TABLE)
    .select("match_id, user_id, user_handle, source_tweet_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(loadLimit);

  if (options?.matchId != null) {
    query = query.eq("match_id", options.matchId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error.message)) {
      console.warn(
        `[reply-bot] ${TABLE} missing — run migration 20260713120000_prediction_bot_replies.sql`,
      );
    } else {
      console.warn(`[reply-bot] load pending failed: ${error.message}`);
    }
    return {
      enabled: true,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      stoppedReason: "load_error",
    };
  }

  const pending = (data ?? []) as PendingRow[];
  const result: PredictionBotProcessResult = {
    enabled: true,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  let sentThisRun = 0;

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]!;
    if (maxPerRun != null && sentThisRun >= maxPerRun) {
      result.stoppedReason = "run_cap";
      console.log(
        `[reply-bot] run cap reached (${sentThisRun}/${maxPerRun}) — more pending next cron`,
      );
      break;
    }

    result.processed += 1;
    const handle = (row.user_handle ?? row.user_id).replace(/^@/, "");

    if (isPredictionReplyBotFirstTimeOnly()) {
      if (await hasPriorPredictions(row.user_id, row.match_id)) {
        await markReply(row.match_id, row.user_id, {
          status: "skipped",
          error: "not_first_time",
        });
        result.skipped += 1;
        console.log(
          `[reply-bot] skipped @${handle} match ${row.match_id}: not first-time predictor`,
        );
        continue;
      }
    }

    const posted = await postTweetAsUser({
      text: PREDICTION_REPLY_BOT_MESSAGE,
      inReplyToTweetId: row.source_tweet_id,
    });

    if (posted.ok) {
      await markReply(row.match_id, row.user_id, {
        status: "sent",
        botTweetId: posted.tweetId,
      });
      result.sent += 1;
      sentThisRun += 1;
      console.log(
        `[reply-bot] replied to @${handle} match ${row.match_id} (bot tweet ${posted.tweetId})`,
      );
      if (i < pending.length - 1) {
        await sleep(minGapMs);
      }
      continue;
    }

    if (posted.rateLimited) {
      await markReply(row.match_id, row.user_id, {
        status: "pending",
        error: posted.error,
      });
      result.stoppedReason = "x_api_429";
      console.log(
        `[reply-bot] rate-limited by X API for @${handle} — leaving pending, stopping run`,
      );
      break;
    }

    // Permanent-ish failures (auth, duplicate, forbidden): mark failed, don't retry forever.
    const permanent =
      posted.status === 401 ||
      posted.status === 403 ||
      posted.status === 404 ||
      /duplicate/i.test(posted.error);

    await markReply(row.match_id, row.user_id, {
      status: permanent ? "failed" : "pending",
      error: posted.error,
    });
    result.failed += 1;
    console.log(
      `[reply-bot] API error for @${handle} match ${row.match_id}: ${posted.error}` +
        (permanent ? " (marked failed)" : " (left pending)"),
    );

    if (posted.status === 503 || posted.status === 502) {
      result.stoppedReason = "x_api_outage";
      console.log("[reply-bot] X API outage — stopping run");
      break;
    }
  }

  return result;
}
