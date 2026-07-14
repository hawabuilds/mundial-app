import type { Fixture } from "@/app/data/fixtures";
import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { isReplyBeforeKickoff } from "@/lib/predictionEligibility";
import { fetchReplies } from "@/lib/fetchReplies";
import { parsePrediction } from "@/lib/predictionParser";
import {
  enqueuePredictionBotReply,
  isPredictionReplyBotEnabled,
  processPredictionBotReplies,
  type PredictionBotProcessResult,
} from "@/lib/predictionReplyBot";

export type LiveReplyBotThread = {
  matchId: number;
  tweetId: string;
  home: string;
  away: string;
  kickoffAt: string;
  replyBotSinceId: string | null;
};

export type LiveReplyBotPassResult = {
  enabled: boolean;
  checkedAt: string;
  threadsScanned: number;
  repliesScanned: number;
  validPredictionsSeen: number;
  queued: number;
  process: PredictionBotProcessResult;
  threadErrors: Array<{ matchId: number; error: string }>;
  message: string;
};

function maxTweetId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return ids.reduce((best, id) => (BigInt(id) > BigInt(best) ? id : best));
}

/** Pre-kickoff match threads with a registered tweet id. */
export async function loadOpenMatchThreadsForReplyBot(
  now: Date = new Date(),
): Promise<LiveReplyBotThread[]> {
  const supabase = getSupabaseAdminClient();
  type ThreadRow = {
    match_id: number | string;
    home_team: string | null;
    away_team: string | null;
    kickoff_at: string | null;
    match_tweet_id: string | null;
    reply_bot_since_id?: string | null;
  };

  let data: ThreadRow[] | null = null;
  let error: { message: string } | null = null;

  {
    const first = await supabase
      .from("match_state")
      .select(
        "match_id, home_team, away_team, kickoff_at, match_tweet_id, reply_bot_since_id",
      )
      .not("match_tweet_id", "is", null)
      .not("kickoff_at", "is", null)
      .gt("kickoff_at", now.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(20);
    data = (first.data as ThreadRow[] | null) ?? null;
    error = first.error;
  }

  if (error && /reply_bot_since_id/i.test(error.message)) {
    console.warn(
      "[reply-bot] reply_bot_since_id missing — run migration 20260714130000_match_state_reply_bot_since_id.sql (scanning without cursor)",
    );
    const fallback = await supabase
      .from("match_state")
      .select("match_id, home_team, away_team, kickoff_at, match_tweet_id")
      .not("match_tweet_id", "is", null)
      .not("kickoff_at", "is", null)
      .gt("kickoff_at", now.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(20);
    data = (fallback.data as ThreadRow[] | null) ?? null;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  const threads: LiveReplyBotThread[] = [];
  for (const row of data ?? []) {
    const tweetId = String(row.match_tweet_id ?? "").trim();
    const kickoffAt = String(row.kickoff_at ?? "");
    const home = String(row.home_team ?? "").trim();
    const away = String(row.away_team ?? "").trim();
    if (!tweetId || !kickoffAt || !home || !away) continue;
    const sinceRaw = row.reply_bot_since_id;
    threads.push({
      matchId: Number(row.match_id),
      tweetId,
      home,
      away,
      kickoffAt,
      replyBotSinceId:
        sinceRaw != null && String(sinceRaw).trim()
          ? String(sinceRaw).trim()
          : null,
    });
  }
  return threads;
}

async function advanceReplyBotSinceId(
  matchId: number,
  sinceId: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("match_state")
    .update({ reply_bot_since_id: sinceId })
    .eq("match_id", matchId);
  if (error) {
    console.warn(
      `[reply-bot] failed to save since_id for match ${matchId}: ${error.message}`,
    );
  }
}

function threadToFixture(thread: LiveReplyBotThread): Fixture {
  const kickoff = new Date(thread.kickoffAt);
  const iso = kickoff.toISOString();
  return {
    id: thread.matchId,
    home: thread.home,
    away: thread.away,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: "FIFA World Cup",
    externalFixtureId: thread.matchId,
    autoSettleFromApi: true,
    tweetId: thread.tweetId,
  };
}

/**
 * Watch live pre-kickoff match posts and queue bot replies as valid
 * predictions appear — does not wait for post-kickoff collection.
 * Uses since_id + 1 page so we mostly pay for new replies only.
 */
export async function runLivePredictionReplyBot(
  now: Date = new Date(),
): Promise<LiveReplyBotPassResult> {
  const checkedAt = now.toISOString();
  if (!isPredictionReplyBotEnabled()) {
    return {
      enabled: false,
      checkedAt,
      threadsScanned: 0,
      repliesScanned: 0,
      validPredictionsSeen: 0,
      queued: 0,
      process: {
        enabled: false,
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
      },
      threadErrors: [],
      message: "reply bot disabled",
    };
  }

  const threads = await loadOpenMatchThreadsForReplyBot(now);
  let repliesScanned = 0;
  let validPredictionsSeen = 0;
  let queued = 0;
  const threadErrors: Array<{ matchId: number; error: string }> = [];

  for (const thread of threads) {
    try {
      const fixture = threadToFixture(thread);
      const replies = await fetchReplies(thread.tweetId, {
        maxPages: 1,
        sinceId: thread.replyBotSinceId,
      });
      repliesScanned += replies.length;

      const newestId = maxTweetId(replies.map((r) => r.id));
      if (newestId) {
        await advanceReplyBotSinceId(thread.matchId, newestId);
      }

      const seenAuthors = new Set<string>();
      for (const reply of replies) {
        if (seenAuthors.has(reply.authorId)) continue;
        seenAuthors.add(reply.authorId);

        if (!isReplyBeforeKickoff(reply.createdAt, fixture)) continue;
        if (!parsePrediction(reply.text, fixture)) continue;

        validPredictionsSeen += 1;
        const result = await enqueuePredictionBotReply({
          matchId: thread.matchId,
          userId: reply.authorId,
          userHandle: reply.authorUsername.startsWith("@")
            ? reply.authorUsername
            : `@${reply.authorUsername}`,
          sourceTweetId: reply.id,
        });
        if (result === "queued") queued += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      threadErrors.push({ matchId: thread.matchId, error: message });
      console.warn(
        `[reply-bot] live scan failed for match ${thread.matchId}: ${message}`,
      );
    }
  }

  const process = await processPredictionBotReplies();
  const message = `scanned ${threads.length} open threads, queued ${queued}, sent ${process.sent}`;
  console.log(`[reply-bot] ${message}`);

  return {
    enabled: true,
    checkedAt,
    threadsScanned: threads.length,
    repliesScanned,
    validPredictionsSeen,
    queued,
    process,
    threadErrors,
    message,
  };
}
