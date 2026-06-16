import { config } from "dotenv";
config({ path: ".env.local" });

import type { Fixture } from "../app/data/fixtures";
import {
  getLeaderboard,
  getSupabaseClient,
  scoreMatchPredictions,
} from "../app/lib/supabase";
import { collectPredictionsForFixture } from "../lib/collectPredictions";

/** Saint-Étienne vs Nice — match 1 (already scored 0-0). */
const MATCH_1: Fixture = {
  id: 1,
  home: "Saint-Étienne",
  away: "Nice",
  date: "2026-05-26",
  time: "18:45",
  group: "L1 Playoff",
  tweetId: "2059031141194125349",
  result: { homeScore: 0, awayScore: 0 },
};

async function hasCompositePrimaryKey(): Promise<boolean> {
  const sb = getSupabaseClient();
  const testUser = "__pk_test__";
  await sb.from("predictions").delete().eq("user_id", testUser);

  const first = await sb.from("predictions").insert({
    user_id: testUser,
    user_handle: "@test",
    match_id: 1,
    home_score: 1,
    away_score: 0,
  });
  if (first.error) {
    await sb.from("predictions").delete().eq("user_id", testUser);
    return false;
  }

  const second = await sb.from("predictions").insert({
    user_id: testUser,
    user_handle: "@test",
    match_id: 2,
    home_score: 2,
    away_score: 1,
  });

  const { data } = await sb
    .from("predictions")
    .select("match_id")
    .eq("user_id", testUser);
  await sb.from("predictions").delete().eq("user_id", testUser);

  return !second.error && (data?.length ?? 0) === 2;
}

async function main() {
  const compositePk = await hasCompositePrimaryKey();
  if (!compositePk) {
    console.error(
      "Database still uses primary key (user_id) only.\n" +
        "Open Supabase → SQL editor → run supabase/schema.sql\n" +
        "Then run this script again.",
    );
    process.exit(1);
  }

  console.log("Composite PK OK — backfilling match 1 predictions…");

  const collected = await collectPredictionsForFixture(MATCH_1);
  console.log("Collection:", JSON.stringify(collected, null, 2));

  const scored = await scoreMatchPredictions(MATCH_1.id, MATCH_1.result!, MATCH_1);
  console.log("Scoring:", JSON.stringify(scored, null, 2));

  console.log("\nLeaderboard:", JSON.stringify(await getLeaderboard(), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
