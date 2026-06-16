import type { Fixture } from "@/app/data/fixtures";

import { fixtureDateTime } from "@/app/data/fixtures";

import type { FetchedReply } from "./fetchReplies";

import { fetchReplies } from "./fetchReplies";

import { parsePrediction } from "./predictionParser";

import { CRON_MATCH_POST_OPTIONS, resolveMatchTweetId } from "./resolveMatchTweet";



export type EligiblePrediction = {

  userId: string;

  userHandle: string;

  homeScore: number;

  awayScore: number;

  repliedAt: string;

};



/** Predictions must be posted strictly before scheduled kickoff (UTC). */

export function isReplyBeforeKickoff(

  replyCreatedAt: string,

  fixture: Fixture,

): boolean {

  return new Date(replyCreatedAt).getTime() < fixtureDateTime(fixture).getTime();

}



function formatHandle(username: string): string {

  return username.startsWith("@") ? username : `@${username}`;

}



/** Valid pre-kickoff predictions from X replies (first reply per author wins). */

export function buildEligiblePreKickoffPredictions(

  replies: FetchedReply[],

  fixture: Fixture,

): Map<string, EligiblePrediction> {

  const eligible = new Map<string, EligiblePrediction>();



  for (const reply of replies) {

    if (eligible.has(reply.authorId)) continue;

    if (!isReplyBeforeKickoff(reply.createdAt, fixture)) continue;



    const parsed = parsePrediction(reply.text, fixture);

    if (!parsed) continue;



    eligible.set(reply.authorId, {

      userId: reply.authorId,

      userHandle: formatHandle(reply.authorUsername),

      homeScore: parsed.homeScore,

      awayScore: parsed.awayScore,

      repliedAt: reply.createdAt,

    });

  }



  return eligible;

}



/** Fetches replies from X — prefer {@link buildEligiblePreKickoffPredictions} when replies are already loaded. */

export async function loadEligiblePreKickoffPredictions(

  fixture: Fixture,

): Promise<Map<string, EligiblePrediction>> {

  const tweetId = await resolveMatchTweetId(fixture, CRON_MATCH_POST_OPTIONS);

  if (!tweetId) {

    throw new Error(

      `No match post found for fixture ${fixture.id}. Post from @copamundialapp with both team names, or set tweetId.`,

    );

  }



  const replies = await fetchReplies(tweetId);

  return buildEligiblePreKickoffPredictions(replies, fixture);

}

