/**
 * One-shot: collect France/Spain then rescore (already scored_at in DB).
 * Usage: npx tsx scripts/collect-rescore-france-spain.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { Fixture } from "@/app/data/fixtures";
import {
  getSupabaseAdminClient,
  markMatchCollected,
  rescoreCollectedMatch,
} from "@/app/lib/supabase";
import { shouldMarkMatchCollected } from "@/lib/collectionComplete";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import {
  buildTxStartTimeByFixtureId,
  resolveTxStartTimeForFixture,
} from "@/lib/effectiveKickoff";
import { fetchFixturesSnapshot } from "@/lib/txodds";

const MATCH_ID = 18237038;
const TWEET_ID = "2076979253099245637";

async function loadFixture(): Promise<Fixture> {
  const c = getSupabaseAdminClient();
  const { data, error } = await c
    .from("match_state")
    .select(
      "match_id, tx_fixture_id, home_team, away_team, kickoff_at, competition, match_tweet_id",
    )
    .eq("match_id", MATCH_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.kickoff_at) throw new Error("match_state missing");
  const iso = new Date(String(data.kickoff_at)).toISOString();
  return {
    id: MATCH_ID,
    home: String(data.home_team ?? ""),
    away: String(data.away_team ?? ""),
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: String(data.competition ?? "FIFA World Cup"),
    externalFixtureId: Number(data.tx_fixture_id ?? MATCH_ID),
    autoSettleFromApi: true,
    tweetId: TWEET_ID,
  };
}

async function main() {
  const fixture = await loadFixture();
  console.log(`${fixture.home} vs ${fixture.away}`);

  const snapshot = await fetchFixturesSnapshot({ fresh: true });
  const startByTxId = buildTxStartTimeByFixtureId(snapshot);
  const kickoffMs =
    resolveTxStartTimeForFixture(fixture, startByTxId, snapshot) ??
    Date.parse(`${fixture.date}T${fixture.time}:00Z`);

  const result = await collectPredictionsForFixture(
    fixture,
    TWEET_ID,
    kickoffMs,
  );
  console.log("collection:", JSON.stringify(result, null, 2));

  if (!shouldMarkMatchCollected(result)) {
    throw new Error("Collection returned 0 replies — not marking/rescoring");
  }

  await markMatchCollected(MATCH_ID);
  console.log("marked collected");

  const scored = await rescoreCollectedMatch(MATCH_ID, fixture);
  console.log("rescore:", JSON.stringify(scored, null, 2));

  const c = getSupabaseAdminClient();
  const { count: total } = await c
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("match_id", MATCH_ID);
  const { count: withPoints } = await c
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("match_id", MATCH_ID)
    .not("points", "is", null);
  console.log({ predictions: total, withPoints });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
