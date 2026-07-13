import type { Fixture } from "../app/data/fixtures";
import { savePrediction } from "../app/lib/supabase";
import {
  buildEligiblePreKickoffPredictions,
  isReplyBeforeKickoff,
} from "./predictionEligibility";
import { fetchReplies } from "./fetchReplies";
import { parsePrediction } from "./predictionParser";
import {
  COLLECTION_MATCH_POST_OPTIONS,
  resolveMatchTweetId,
} from "./resolveMatchTweet";
import {
  enqueuePredictionBotReply,
  isPredictionReplyBotEnabled,
  predictionAlreadyExists,
  processPredictionBotReplies,
} from "./predictionReplyBot";

export type CollectResult = {
  matchId: number;
  fixture: string;
  tweetId: string;
  repliesFetched: number;
  validPredictionsSaved: number;
  rejectedPredictions: number;
  skippedDuplicateAuthors: number;
  skippedAfterKickoff: number;
  replyBot?: {
    queued: number;
    sent: number;
    skipped: number;
    failed: number;
    stoppedReason?: string;
  };
};

export { isReplyBeforeKickoff } from "./predictionEligibility";

export async function collectPredictionsForFixture(
  fixture: Fixture,
  tweetIdOverride?: string,
  effectiveKickoffMs?: number,
): Promise<CollectResult> {
  const tweetId =
    tweetIdOverride?.trim() ||
    (await resolveMatchTweetId(fixture, COLLECTION_MATCH_POST_OPTIONS));

  if (!tweetId) {
    throw new Error(
      `No match post found for fixture ${fixture.id}. Post from @copamundialapp with both team names, or set tweetId.`,
    );
  }

  const replies = await fetchReplies(tweetId);
  const eligible = buildEligiblePreKickoffPredictions(
    replies,
    fixture,
    effectiveKickoffMs,
  );

  let rejectedPredictions = 0;
  let skippedDuplicateAuthors = 0;
  let skippedAfterKickoff = 0;
  const seenAuthors = new Set<string>();

  for (const reply of replies) {
    if (seenAuthors.has(reply.authorId)) {
      skippedDuplicateAuthors += 1;
      continue;
    }
    seenAuthors.add(reply.authorId);

    if (!isReplyBeforeKickoff(reply.createdAt, fixture, effectiveKickoffMs)) {
      skippedAfterKickoff += 1;
      continue;
    }

    if (!parsePrediction(reply.text, fixture)) {
      rejectedPredictions += 1;
    }
  }

  let replyBotQueued = 0;

  for (const prediction of eligible.values()) {
    const existed = await predictionAlreadyExists(
      prediction.userId,
      fixture.id,
    );

    await savePrediction({
      user_id: prediction.userId,
      user_handle: prediction.userHandle,
      match_id: fixture.id,
      home_score: prediction.homeScore,
      away_score: prediction.awayScore,
      replied_at: prediction.repliedAt,
    });

    // Only enqueue for newly seen predictors on this match (avoids spam on re-collect).
    if (!existed && isPredictionReplyBotEnabled()) {
      const queued = await enqueuePredictionBotReply({
        matchId: fixture.id,
        userId: prediction.userId,
        userHandle: prediction.userHandle,
        sourceTweetId: prediction.sourceTweetId,
      });
      if (queued === "queued") replyBotQueued += 1;
    }
  }

  let replyBot:
    | CollectResult["replyBot"]
    | undefined;

  if (isPredictionReplyBotEnabled()) {
    const bot = await processPredictionBotReplies({ matchId: fixture.id });
    replyBot = {
      queued: replyBotQueued,
      sent: bot.sent,
      skipped: bot.skipped,
      failed: bot.failed,
      ...(bot.stoppedReason ? { stoppedReason: bot.stoppedReason } : {}),
    };
  }

  return {
    matchId: fixture.id,
    fixture: `${fixture.home} vs ${fixture.away}`,
    tweetId,
    repliesFetched: replies.length,
    validPredictionsSaved: eligible.size,
    rejectedPredictions,
    skippedDuplicateAuthors,
    skippedAfterKickoff,
    ...(replyBot ? { replyBot } : {}),
  };
}
