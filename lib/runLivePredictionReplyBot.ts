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

/** Pre-kickoff match threads with a registered tweet id. */
export async function loadOpenMatchThreadsForReplyBot(
  now: Date = new Date(),
): Promise<LiveReplyBotThread[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_state")
    .select("match_id, home_team, away_team, kickoff_at, match_tweet_id")
    .not("match_tweet_id", "is", null)
    .not("kickoff_at", "is", null)
    .gt("kickoff_at", now.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);

  const threads: LiveReplyBotThread[] = [];
  for (const row of data ?? []) {
    const tweetId = String(row.match_tweet_id ?? "").trim();
    const kickoffAt = String(row.kickoff_at ?? "");
    const home = String(row.home_team ?? "").trim();
    const away = String(row.away_team ?? "").trim();
    if (!tweetId || !kickoffAt || !home || !away) continue;
    threads.push({
      matchId: Number(row.match_id),
      tweetId,
      home,
      away,
      kickoffAt,
    });
  }
  return threads;
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
      // Keep polling light — cron retries soon for more pages.
      const replies = await fetchReplies(thread.tweetId, { maxPages: 2 });
      repliesScanned += replies.length;

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
