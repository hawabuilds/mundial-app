import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { postTweetAsUser, readXUserOAuth1Credentials } from "@/lib/xPostTweet";

export const PREDICTION_REPLY_BOT_MESSAGE =
  "Nice pick 🔮 Now double your points by predicting the first goalscorer in the app 👉 copamundial.app · Join → discord.gg/BS3q3aMFd";

export type PredictionBotReplyKind = "success" | "format_nudge";

export function formatPredictionReplyBotNudgeMessage(
  home: string,
  away: string,
): string {
  return `Almost — reply again on the match post with both teams and a score, e.g. ${home} 2-1 ${away}. First valid reply before kickoff counts.`;
}

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

function isMissingReplyKindError(message: string): boolean {
  return /reply_kind/i.test(message);
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

async function botReplyRowExists(
  matchId: number,
  userId: string,
  replyKind: PredictionBotReplyKind,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from(TABLE)
    .select("user_id")
    .eq("match_id", matchId)
    .eq("user_id", userId);

  if (replyKind === "success") {
    query = query.eq("reply_kind", replyKind);
  } else {
    query = query.eq("reply_kind", replyKind);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingReplyKindError(error.message)) {
      if (replyKind === "format_nudge") return false;
      const legacy = await supabase
        .from(TABLE)
        .select("user_id")
        .eq("match_id", matchId)
        .eq("user_id", userId)
        .maybeSingle();
      return Boolean(legacy.data);
    }
    console.warn(`[reply-bot] bot reply lookup failed: ${error.message}`);
    return true;
  }
  return Boolean(data);
}

async function enqueueBotReply(
  input: PredictionBotEnqueueInput,
  replyKind: PredictionBotReplyKind,
): Promise<"queued" | "exists" | "skipped" | "error"> {
  if (!isPredictionReplyBotEnabled()) return "skipped";

  if (replyKind === "success" && isPredictionReplyBotFirstTimeOnly()) {
    if (await hasPriorPredictions(input.userId, input.matchId)) {
      console.log(
        `[reply-bot] skipped @${input.userHandle.replace(/^@/, "")} match ${input.matchId}: not first-time predictor`,
      );
      return "skipped";
    }
  }

  const supabase = getSupabaseAdminClient();
  const row = {
    match_id: input.matchId,
    user_id: input.userId,
    user_handle: input.userHandle,
    source_tweet_id: input.sourceTweetId,
    status: "pending" as const,
    reply_kind: replyKind,
  };

  let { error } = await supabase.from(TABLE).insert(row);

  if (error && isMissingReplyKindError(error.message)) {
    if (replyKind === "format_nudge") {
      return "error";
    }
    ({ error } = await supabase.from(TABLE).insert({
      match_id: input.matchId,
      user_id: input.userId,
      user_handle: input.userHandle,
      source_tweet_id: input.sourceTweetId,
      status: "pending",
    }));
  }

  if (!error) {
    console.log(
      `[reply-bot] queued ${replyKind} @${input.userHandle.replace(/^@/, "")} match ${input.matchId}`,
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

/** Queue a once-per-user-per-match success bot reply (no-op if already queued/sent). */
export async function enqueuePredictionBotReply(
  input: PredictionBotEnqueueInput,
): Promise<"queued" | "exists" | "skipped" | "error"> {
  return enqueueBotReply(input, "success");
}

/** Queue a once-per-user-per-match format nudge (invalid score template). */
export async function enqueuePredictionBotFormatNudge(
  input: PredictionBotEnqueueInput,
): Promise<"queued" | "exists" | "skipped" | "error"> {
  if (!isPredictionReplyBotEnabled()) return "skipped";

  if (await botReplyRowExists(input.matchId, input.userId, "success")) {
    return "exists";
  }
  if (await botReplyRowExists(input.matchId, input.userId, "format_nudge")) {
    return "exists";
  }

  return enqueueBotReply(input, "format_nudge");
}

async function markReply(
  matchId: number,
  userId: string,
  replyKind: PredictionBotReplyKind,
  patch: {
    status: PredictionBotReplyStatus;
    botTweetId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from(TABLE)
    .update({
      status: patch.status,
      bot_tweet_id: patch.botTweetId ?? null,
      error: patch.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("match_id", matchId)
    .eq("user_id", userId);

  query = query.eq("reply_kind", replyKind);

  const { error } = await query;

  if (error && isMissingReplyKindError(error.message) && replyKind === "success") {
    const fallback = await supabase
      .from(TABLE)
      .update({
        status: patch.status,
        bot_tweet_id: patch.botTweetId ?? null,
        error: patch.error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("match_id", matchId)
      .eq("user_id", userId);
    if (fallback.error && !isMissingTableError(fallback.error.message)) {
      console.warn(`[reply-bot] mark ${patch.status} failed: ${fallback.error.message}`);
    }
    return;
  }

  if (error && !isMissingTableError(error.message)) {
    console.warn(`[reply-bot] mark ${patch.status} failed: ${error.message}`);
  }
}

type PendingRow = {
  match_id: number;
  user_id: string;
  user_handle: string | null;
  source_tweet_id: string;
  reply_kind?: PredictionBotReplyKind | null;
};

async function loadMatchTeamsForBot(
  matchIds: number[],
): Promise<Map<number, { home: string; away: string }>> {
  const out = new Map<number, { home: string; away: string }>();
  if (matchIds.length === 0) return out;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_state")
    .select("match_id, home_team, away_team")
    .in("match_id", matchIds);

  if (error) {
    console.warn(`[reply-bot] match team lookup failed: ${error.message}`);
    return out;
  }

  for (const row of data ?? []) {
    const home = String(row.home_team ?? "").trim();
    const away = String(row.away_team ?? "").trim();
    if (home && away) {
      out.set(Number(row.match_id), { home, away });
    }
  }
  return out;
}

function replyTextForRow(
  row: PendingRow,
  teamsByMatchId: Map<number, { home: string; away: string }>,
): string | null {
  const kind = row.reply_kind ?? "success";
  if (kind === "success") return PREDICTION_REPLY_BOT_MESSAGE;
  const teams = teamsByMatchId.get(row.match_id);
  if (!teams) return null;
  return formatPredictionReplyBotNudgeMessage(teams.home, teams.away);
}

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
  const loadLimit = maxPerRun ?? 1_000;

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from(TABLE)
    .select("match_id, user_id, user_handle, source_tweet_id, reply_kind")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(loadLimit);

  if (options?.matchId != null) {
    query = query.eq("match_id", options.matchId);
  }

  let { data, error } = await query;

  if (error && isMissingReplyKindError(error.message)) {
    let legacyQuery = supabase
      .from(TABLE)
      .select("match_id, user_id, user_handle, source_tweet_id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(loadLimit);
    if (options?.matchId != null) {
      legacyQuery = legacyQuery.eq("match_id", options.matchId);
    }
    const legacy = await legacyQuery;
    data = (legacy.data ?? []).map((row) => ({ ...row, reply_kind: "success" }));
    error = legacy.error;
  }

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
  const teamsByMatchId = await loadMatchTeamsForBot([
    ...new Set(pending.map((row) => row.match_id)),
  ]);

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
    const replyKind = row.reply_kind ?? "success";

    if (maxPerRun != null && sentThisRun >= maxPerRun) {
      result.stoppedReason = "run_cap";
      console.log(
        `[reply-bot] run cap reached (${sentThisRun}/${maxPerRun}) — more pending next cron`,
      );
      break;
    }

    result.processed += 1;
    const handle = (row.user_handle ?? row.user_id).replace(/^@/, "");

    if (replyKind === "success" && isPredictionReplyBotFirstTimeOnly()) {
      if (await hasPriorPredictions(row.user_id, row.match_id)) {
        await markReply(row.match_id, row.user_id, replyKind, {
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

    const text = replyTextForRow(row, teamsByMatchId);
    if (!text) {
      await markReply(row.match_id, row.user_id, replyKind, {
        status: "skipped",
        error: "missing_match_teams",
      });
      result.skipped += 1;
      continue;
    }

    const posted = await postTweetAsUser({
      text,
      inReplyToTweetId: row.source_tweet_id,
    });

    if (posted.ok) {
      await markReply(row.match_id, row.user_id, replyKind, {
        status: "sent",
        botTweetId: posted.tweetId,
      });
      result.sent += 1;
      sentThisRun += 1;
      console.log(
        `[reply-bot] replied ${replyKind} to @${handle} match ${row.match_id} (bot tweet ${posted.tweetId})`,
      );
      if (i < pending.length - 1) {
        await sleep(minGapMs);
      }
      continue;
    }

    if (posted.rateLimited) {
      await markReply(row.match_id, row.user_id, replyKind, {
        status: "pending",
        error: posted.error,
      });
      result.stoppedReason = "x_api_429";
      console.log(
        `[reply-bot] rate-limited by X API for @${handle} — leaving pending, stopping run`,
      );
      break;
    }

    const permanent =
      posted.status === 401 ||
      posted.status === 403 ||
      posted.status === 404 ||
      /duplicate/i.test(posted.error);

    await markReply(row.match_id, row.user_id, replyKind, {
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
