/**
 * Retry knockout prediction collection until X API responds or time runs out.
 *
 * Usage: npx tsx scripts/retry-collect-knockout.ts
 *        npx tsx scripts/retry-collect-knockout.ts --hours 8 --interval 5
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { Fixture } from "@/app/data/fixtures";
import { fixtureCacheKey } from "@/app/data/fixtures";
import {
  getSupabaseAdminClient,
  isEffectivelyCollected,
  markMatchCollected,
  saveMatchTweetId,
} from "@/app/lib/supabase";
import { shouldMarkMatchCollected } from "@/lib/collectionComplete";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import {
  buildTxStartTimeByFixtureId,
  resolveTxStartTimeForFixture,
} from "@/lib/effectiveKickoff";
import { fetchReplies } from "@/lib/fetchReplies";
import { fetchFixturesSnapshot } from "@/lib/txodds";

const MATCH_IDS = [18213979, 18222446] as const;

const TWEETS: Record<number, string> = {
  18213979: "2075995261210386810",
  18222446: "2076086965921792310",
};

function parseArgs(argv: string[]): { hours: number; intervalMin: number } {
  let hours = 8;
  let intervalMin = 5;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--hours" && argv[i + 1]) {
      hours = Number.parseFloat(argv[++i]!);
    } else if (argv[i] === "--interval" && argv[i + 1]) {
      intervalMin = Number.parseFloat(argv[++i]!);
    }
  }
  return { hours, intervalMin };
}

async function loadFixture(matchId: number): Promise<Fixture | null> {
  const c = getSupabaseAdminClient();
  const { data, error } = await c
    .from("match_state")
    .select(
      "match_id, tx_fixture_id, home_team, away_team, kickoff_at, competition, match_tweet_id",
    )
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.kickoff_at) return null;

  const iso = new Date(String(data.kickoff_at)).toISOString();
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
    tweetId: (data.match_tweet_id as string | null) ?? TWEETS[matchId],
  };
}

async function collectOne(
  fixture: Fixture,
  effectiveKickoffMs: number,
): Promise<{ ok: boolean; result?: Awaited<ReturnType<typeof collectPredictionsForFixture>>; error?: string }> {
  const tweetId = fixture.tweetId?.trim() ?? TWEETS[fixture.id];
  if (!tweetId) return { ok: false, error: "no tweet id" };

  await saveMatchTweetId(
    fixture.id,
    tweetId,
    fixtureCacheKey({ home: fixture.home, away: fixture.away, date: fixture.date }),
  );

  // Probe replies first — avoids full collect path when X is still 503.
  await fetchReplies(tweetId);

  const result = await collectPredictionsForFixture(
    fixture,
    tweetId,
    effectiveKickoffMs,
  );

  if (shouldMarkMatchCollected(result)) {
    await markMatchCollected(fixture.id);
  }

  return { ok: true, result };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const { hours, intervalMin } = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + hours * 3_600_000;
  const intervalMs = intervalMin * 60_000;

  console.log(
    `Retry collect started — every ${intervalMin}m for up to ${hours}h (match_ids: ${MATCH_IDS.join(", ")})`,
  );

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const stamp = new Date().toISOString();
    console.log(`\n[${stamp}] attempt ${attempt}`);

    const pending: number[] = [];
    for (const matchId of MATCH_IDS) {
      if (await isEffectivelyCollected(matchId)) {
        console.log(`  ${matchId}: already collected`);
      } else {
        pending.push(matchId);
      }
    }

    if (pending.length === 0) {
      console.log("All matches collected. Done.");
      return;
    }

    const snapshot = await fetchFixturesSnapshot().catch(() => []);
    const startByTxId = buildTxStartTimeByFixtureId(snapshot);

    for (const matchId of pending) {
      const fixture = await loadFixture(matchId);
      if (!fixture) {
        console.log(`  ${matchId}: fixture not found in match_state`);
        continue;
      }

      const kickoffMs =
        resolveTxStartTimeForFixture(fixture, startByTxId, snapshot) ??
        Date.parse(`${fixture.date}T${fixture.time}:00Z`);

      try {
        const out = await collectOne(fixture, kickoffMs);
        if (out.result) {
          console.log(
            `  ${fixture.home} vs ${fixture.away}: saved ${out.result.validPredictionsSaved} predictions (${out.result.repliesFetched} replies fetched)`,
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  ${fixture.home} vs ${fixture.away}: ${msg}`);
      }
    }

    const stillPending = (
      await Promise.all(
        MATCH_IDS.map(async (id) => ((await isEffectivelyCollected(id)) ? null : id)),
      )
    ).filter((id): id is number => id != null);

    if (stillPending.length === 0) {
      console.log("All matches collected. Done.");
      return;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    console.log(
      `Waiting ${intervalMin}m… still pending: ${stillPending.join(", ")}`,
    );
    await sleep(Math.min(intervalMs, remainingMs));
  }

  console.log("Retry window ended without collecting all matches.");
  process.exit(1);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
