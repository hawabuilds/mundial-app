/**
 * Re-fetch X replies and save predictions after fixing match_tweet_id.
 * Usage: npx tsx scripts/recollect-match.ts 13
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getFixtureById } from "../app/data/fixtures";
import {
  clearMatchTweetId,
  isMatchScored,
  markMatchCollected,
  resetMatchCollection,
  resetMatchScoring,
  saveMatchTweetId,
} from "../app/lib/supabase";
import { collectPredictionsForFixture } from "../lib/collectPredictions";
import { fixtureCacheKey } from "../app/data/fixtures";
import { shouldMarkMatchCollected } from "../lib/collectionComplete";
import { CRON_MATCH_POST_OPTIONS, resolveMatchPost } from "../lib/resolveMatchTweet";

async function main() {
  const matchId = Number.parseInt(process.argv[2] ?? "", 10);
  if (!Number.isInteger(matchId)) {
    console.error("Usage: npx tsx scripts/recollect-match.ts <matchId>");
    process.exit(1);
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) {
    console.error(`Unknown matchId: ${matchId}`);
    process.exit(1);
  }

  console.log(`Recollecting: ${fixture.home} vs ${fixture.away} (match ${matchId})`);

  if (fixture.tweetId?.trim()) {
    await saveMatchTweetId(matchId, fixture.tweetId.trim(), fixtureCacheKey(fixture));
    console.log("Using fixture.tweetId:", fixture.tweetId.trim());
  } else {
    await clearMatchTweetId(matchId);
    const post = await resolveMatchPost(fixture, CRON_MATCH_POST_OPTIONS);
    if (!post) {
      console.error("No match post found — post on X or set tweetId on fixture.");
      process.exit(1);
    }
    console.log("Resolved tweet:", post.tweetId, post.url);
  }

  await resetMatchScoring(matchId);
  await resetMatchCollection(matchId);

  const result = await collectPredictionsForFixture(fixture);
  if (!shouldMarkMatchCollected(result)) {
    console.error(
      "Collection returned 0 replies — check tweet id / X API before rescoring.",
    );
    process.exit(1);
  }
  await markMatchCollected(matchId);

  console.log(JSON.stringify(result, null, 2));
  if (await isMatchScored(matchId)) {
    console.log(
      "\nMatch is still marked scored in DB — run rescore-match with the final score when ready.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
