/**
 * Debug match post resolution for a fixture id.
 * Usage: npx tsx scripts/diagnose-match-post.ts 11
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getFixtureById } from "../app/data/fixtures";
import { getMatchState, getStoredMatchTweetId } from "../app/lib/supabase";
import {
  CRON_MATCH_POST_OPTIONS,
  resolveMatchPost,
  UI_MATCH_POST_OPTIONS,
} from "../lib/resolveMatchTweet";
import {
  discoverMatchPost,
  pickBestTweet,
  tweetIsValidMatchPost,
  tweetMatchesFixture,
} from "../lib/xMatchPosts";
import { getTeamAliases } from "../lib/predictionParser";
import { searchRecentPosts, getMatchPostAccount } from "../lib/xApi";

const matchId = Number.parseInt(process.argv[2] ?? "11", 10);
const fixture = getFixtureById(matchId);
if (!fixture) {
  console.error("Unknown match id", matchId);
  process.exit(1);
}

async function main() {
  console.log("Fixture:", fixture.home, "vs", fixture.away, fixture.date, fixture.time);
  console.log("Aliases home:", getTeamAliases(fixture.home));
  console.log("Aliases away:", getTeamAliases(fixture.away));
  console.log("Account:", getMatchPostAccount());

  try {
    const stored = await getStoredMatchTweetId(matchId);
    const state = await getMatchState(matchId);
    console.log("\nSupabase:");
    console.log("  match_tweet_id:", stored ?? "(none)");
    console.log("  match_fixture_key:", state?.match_fixture_key ?? "(none)");
  } catch (e) {
    console.log("\nSupabase error:", e);
  }

  const account = getMatchPostAccount();
  const base = `-is:retweet -is:reply from:${account}`;
  const q = `${base} (Scotland OR SCO) (Curacao OR curacao)`;
  console.log("\nProbe search query:", q);

  for (const pages of [1, 2] as const) {
    console.log(`\n--- search ${pages} page(s) ---`);
    const hits = await searchRecentPosts(q, pages);
    console.log("hits:", hits.length);
    for (const hit of hits.slice(0, 8)) {
      const matches = tweetMatchesFixture(hit.text, fixture);
      const valid = tweetIsValidMatchPost(hit, fixture);
      console.log(
        `\n  id=${hit.id} valid=${valid} matches=${matches}`,
        `\n  created=${hit.createdAt}`,
        `\n  text=${JSON.stringify(hit.text.slice(0, 200))}`,
      );
    }
    const best = pickBestTweet(hits, fixture);
    console.log("pickBestTweet:", best?.id ?? null);
  }

  console.log("\n--- resolve (UI: trust cache, 1 page) ---");
  const ui = await resolveMatchPost(fixture, UI_MATCH_POST_OPTIONS);
  console.log("UI options:", ui);

  const cron = await resolveMatchPost(fixture, CRON_MATCH_POST_OPTIONS);
  console.log("CRON options:", cron);

  console.log("\n--- discover only (2 pages) ---");
  const disc = await discoverMatchPost(fixture, 2);
  console.log(disc);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
