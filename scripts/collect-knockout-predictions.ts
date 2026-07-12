/**
 * Force prediction collection for board-only knockout fixtures.
 * Bypasses the kickoff cron retry window — use when auto collection missed QFs.
 *
 * Usage:
 *   npx tsx scripts/collect-knockout-predictions.ts
 *   npx tsx scripts/collect-knockout-predictions.ts 18213979 18222446
 *   npx tsx scripts/collect-knockout-predictions.ts 18222446:TWEET_ID_HERE
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { Fixture } from "@/app/data/fixtures";
import { fixtureCacheKey } from "@/app/data/fixtures";
import {
  getSupabaseAdminClient,
  markMatchCollected,
  saveMatchTweetId,
} from "@/app/lib/supabase";
import { shouldMarkMatchCollected } from "@/lib/collectionComplete";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import {
  buildTxStartTimeByFixtureId,
  resolveTxStartTimeForFixture,
} from "@/lib/effectiveKickoff";
import { CRON_MATCH_POST_OPTIONS, resolveMatchPost } from "@/lib/resolveMatchTweet";
import { syncNewFixturesFromTxline } from "@/lib/syncNewFixturesFromTxline";
import {
  fixtureFromRegistryDraft,
  txFixtureToDraft,
} from "@/lib/txlineFixtureSync";
import { fetchFixturesSnapshot } from "@/lib/txodds";

/** Norway vs England QF, Argentina vs Switzerland QF (TxLINE match_ids). */
const DEFAULT_MATCH_IDS = [18213979, 18222446];

type Job = { matchId: number; tweetId?: string };

function parseJobs(argv: string[]): Job[] {
  if (argv.length === 0) {
    return DEFAULT_MATCH_IDS.map((matchId) => ({ matchId }));
  }
  return argv.map((token) => {
    const [idPart, tweetPart] = token.split(":");
    const matchId = Number.parseInt(idPart ?? "", 10);
    if (!Number.isFinite(matchId)) {
      throw new Error(`Invalid match id: ${token}`);
    }
    return { matchId, tweetId: tweetPart?.trim() || undefined };
  });
}

async function loadFixtureFromMatchState(matchId: number): Promise<Fixture | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_state")
    .select(
      "match_id, tx_fixture_id, home_team, away_team, kickoff_at, competition, match_tweet_id",
    )
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.kickoff_at) return null;

  const kickoffAt = String(data.kickoff_at);
  const iso = new Date(kickoffAt).toISOString();
  const txFixtureId = Number(data.tx_fixture_id ?? data.match_id);

  return {
    id: Number(data.match_id),
    home: String(data.home_team ?? ""),
    away: String(data.away_team ?? ""),
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: String(data.competition ?? "FIFA World Cup"),
    externalFixtureId: txFixtureId,
    autoSettleFromApi: true,
    tweetId: (data.match_tweet_id as string | null) ?? undefined,
  };
}

async function resolveFixture(
  matchId: number,
  snapshot: Awaited<ReturnType<typeof fetchFixturesSnapshot>>,
): Promise<Fixture | null> {
  const fromState = await loadFixtureFromMatchState(matchId);
  if (fromState) return fromState;

  const tx = snapshot.find((fx) => fx.FixtureId === matchId);
  if (!tx) return null;
  const draft = txFixtureToDraft(tx);
  return draft ? fixtureFromRegistryDraft(draft) : null;
}

async function main(): Promise<void> {
  const jobs = parseJobs(process.argv.slice(2));
  console.log(
    "Jobs:",
    jobs.map((j) => (j.tweetId ? `${j.matchId} (tweet ${j.tweetId})` : j.matchId)).join(", "),
  );

  const sync = await syncNewFixturesFromTxline();
  console.log(
    "Registry sync:",
    JSON.stringify(
      {
        inserted: sync.inserted.length,
        updated: sync.updated.length,
        awaitingTweet: sync.awaitingTweet.length,
      },
      null,
      2,
    ),
  );

  const snapshot = await fetchFixturesSnapshot({ fresh: true });
  const startByTxId = buildTxStartTimeByFixtureId(snapshot);

  for (const job of jobs) {
    const fixture = await resolveFixture(job.matchId, snapshot);
    if (!fixture) {
      console.log(`\n=== match_id=${job.matchId}: NOT FOUND ===`);
      continue;
    }

    const effectiveKickoffMs =
      resolveTxStartTimeForFixture(fixture, startByTxId, snapshot) ??
      Date.parse(`${fixture.date}T${fixture.time}:00Z`);

    console.log(`\n=== ${fixture.home} vs ${fixture.away} (match_id=${fixture.id}) ===`);
    console.log(`Kickoff: ${new Date(effectiveKickoffMs).toISOString()}`);

    let tweetId = job.tweetId ?? fixture.tweetId?.trim();
    if (!tweetId) {
      const post = await resolveMatchPost(fixture, CRON_MATCH_POST_OPTIONS);
      if (!post) {
        console.log("SKIP: no match post found on X (API may be down)");
        continue;
      }
      tweetId = post.tweetId;
      console.log(`Tweet: ${tweetId} (${post.source})`);
    } else {
      await saveMatchTweetId(fixture.id, tweetId, fixtureCacheKey(fixture));
      console.log(`Tweet: ${tweetId} (manual)`);
    }

    const result = await collectPredictionsForFixture(
      fixture,
      tweetId,
      effectiveKickoffMs,
    );
    console.log("Collection:", JSON.stringify(result, null, 2));

    if (shouldMarkMatchCollected(result)) {
      await markMatchCollected(fixture.id);
      console.log("Marked collected.");
    } else {
      console.log("Not marking collected (0 valid predictions).");
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
