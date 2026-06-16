import { config } from "dotenv";
config({ path: ".env.local" });

import { getFixtureById } from "../app/data/fixtures";
import { getMatchState, getSupabaseAdminClient } from "../app/lib/supabase";
import { fetchTweetById } from "../lib/xApi";
import { tweetIsValidMatchPost } from "../lib/xMatchPosts";

const matchId = Number.parseInt(process.argv[2] ?? "13", 10);

async function main() {
  const fixture = getFixtureById(matchId);
  if (!fixture) {
    console.error("Unknown match", matchId);
    process.exit(1);
  }

  const state = await getMatchState(matchId);
  const sb = getSupabaseAdminClient();
  const { count } = await sb
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);

  console.log("Fixture:", fixture.home, "vs", fixture.away);
  console.log("match_state:", JSON.stringify(state, null, 2));
  console.log("predictions count:", count);

  const storedId = state?.match_tweet_id?.trim();
  if (storedId) {
    const hit = await fetchTweetById(storedId);
    console.log("\nStored tweet:", storedId);
    console.log("  text:", hit?.text?.slice(0, 280) ?? "(not found)");
    console.log(
      "  valid for fixture:",
      hit ? tweetIsValidMatchPost(hit, fixture) : false,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
