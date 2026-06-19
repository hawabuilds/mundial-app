import type { Fixture } from "../app/data/fixtures";

import { savePrediction } from "../app/lib/supabase";

import {

  buildEligiblePreKickoffPredictions,

  isReplyBeforeKickoff,

} from "./predictionEligibility";

import { fetchReplies } from "./fetchReplies";

import { parsePrediction } from "./predictionParser";

import { CRON_MATCH_POST_OPTIONS, resolveMatchTweetId } from "./resolveMatchTweet";



export type CollectResult = {

  matchId: number;

  fixture: string;

  tweetId: string;

  repliesFetched: number;

  validPredictionsSaved: number;

  rejectedPredictions: number;

  skippedDuplicateAuthors: number;

  skippedAfterKickoff: number;

};



export { isReplyBeforeKickoff } from "./predictionEligibility";



export async function collectPredictionsForFixture(
  fixture: Fixture,
  tweetIdOverride?: string,
): Promise<CollectResult> {
  const tweetId =
    tweetIdOverride?.trim() ||
    (await resolveMatchTweetId(fixture, CRON_MATCH_POST_OPTIONS));

  if (!tweetId) {

    throw new Error(

      `No match post found for fixture ${fixture.id}. Post from @copamundialapp with both team names, or set tweetId.`,

    );

  }



  const replies = await fetchReplies(tweetId);

  const eligible = buildEligiblePreKickoffPredictions(replies, fixture);



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



    if (!isReplyBeforeKickoff(reply.createdAt, fixture)) {

      skippedAfterKickoff += 1;

      continue;

    }



    if (!parsePrediction(reply.text, fixture)) {

      rejectedPredictions += 1;

    }

  }



  for (const prediction of eligible.values()) {

    await savePrediction({

      user_id: prediction.userId,

      user_handle: prediction.userHandle,

      match_id: fixture.id,

      home_score: prediction.homeScore,

      away_score: prediction.awayScore,

      replied_at: prediction.repliedAt,

    });

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

  };

}

