import type { Fixture } from "@/app/data/fixtures";

import {
  FIXTURES,
  fixtureDateTime,
  getActiveFixtures,
  isFixtureCancelled,
} from "@/app/data/fixtures";

import {
  isEffectivelyCollected,
  isMatchScored,
  scoreMatchPredictions,
} from "@/app/lib/supabase";

import { ensureMatchOddsForFixture } from "@/lib/ensureMatchOdds";
import { getCollectionFixtureSlate } from "@/lib/syncNewFixturesFromTxline";
import {
  fetchAndPersistMatchProof,
  retryMissingMatchProofs,
} from "@/lib/matchProofFetch";
import {
  ensureMatchGoalsBackfilled,
  retryIncompleteMatchGoalsBackfills,
} from "@/lib/backfillMatchGoals";
import { retryFirstGoalscorerBonusSettlement } from "@/lib/settleFirstGoalscorerBonus";

import {

  TxLineBudgetError,

  fetchTxLineMatch,

  isTxLineConfigured,

  mapMatchRow,

  resolveFinalScoreFromTxLineMatch,

  type LiveMatchData,

} from "./txMatchSettlement";

import { fixtureAutoSettlesFromApi } from "./fixtureAutoSettle";



/** Earliest auto-score check after kickoff (TxLINE must report terminal). */

export const MINUTES_AFTER_KICKOFF_BEFORE_SCORE = 90;



export type AutoScoreResult =

  | { matchId: number; status: "skipped"; reason: string }

  | {

      matchId: number;

      status: "scored";

      homeScore: number;

      awayScore: number;

      source: "api" | "fixture.result";

    }

  | { matchId: number; status: "pending"; apiStatus: string }

  | { matchId: number; status: "error"; error: string };



export function isPastScoringWindow(

  fixture: Fixture,

  now: Date = new Date(),

): boolean {

  const kickoffMs = fixtureDateTime(fixture).getTime();

  const windowMs = MINUTES_AFTER_KICKOFF_BEFORE_SCORE * 60 * 1000;

  return now.getTime() - kickoffMs >= windowMs;

}



function fixtureFinalScore(

  fixture: Fixture,

): { homeScore: number; awayScore: number } | null {

  if (

    fixture.result &&

    typeof fixture.result.homeScore === "number" &&

    typeof fixture.result.awayScore === "number"

  ) {

    return fixture.result;

  }

  return null;

}



/** Fixtures that may need an API-Football score check (past window, not yet scored). */

export function getFixturesDueForAutoScore(

  fixtures: Fixture[] = FIXTURES,

  now: Date = new Date(),

): Fixture[] {

  return fixtures.filter((fixture) => isPastScoringWindow(fixture, now));

}



/** Regular time + ET/PEN + API lag — keep polling finished matches. */
const AUTO_SCORE_MAX_HOURS_AFTER_KICKOFF = 72;



/**

 * Unscored finished matches to poll for a final score.

 * Polled every cron tick from 90 min after kickoff until scored (or 72h old).

 * `fixture.result` can score any time without the API.

 */

export async function getFixturesPendingAutoScore(

  fixtures: Fixture[] = FIXTURES,

  now: Date = new Date(),

): Promise<Fixture[]> {

  const nowMs = now.getTime();

  const maxAgeMs = AUTO_SCORE_MAX_HOURS_AFTER_KICKOFF * 60 * 60 * 1000;

  const pending: Fixture[] = [];



  for (const fixture of fixtures) {
    if (isFixtureCancelled(fixture)) continue;

    const kickoffMs = fixtureDateTime(fixture).getTime();
    const elapsedMs = nowMs - kickoffMs;
    if (elapsedMs < 0) continue;
    if (!isPastScoringWindow(fixture, now)) continue;

    if (await isMatchScored(fixture.id)) continue;

    const manualResult = fixtureFinalScore(fixture);
    const apiAutoSettle = fixtureAutoSettlesFromApi(fixture);
    const collected = await isEffectivelyCollected(fixture.id);
    if (!collected && !manualResult && !apiAutoSettle) {
      continue;
    }

    // Collected-but-unscored matches keep retrying past the normal age cap so a
    // missed settlement (e.g. fixture dropped from TxLINE schedule snapshot)
    // cannot permanently skip scoring.
    if (elapsedMs > maxAgeMs && !collected) continue;

    if (manualResult) {
      pending.push(fixture);
      continue;
    }

    // Poll TxLINE every cron tick from 90 min after kickoff until scored.
    pending.push(fixture);
  }



  return pending;

}



/** Static registry + TxLINE auto fixtures with tweets — same slate as collection. */
export async function getFixturesPendingAutoScoreFromSlate(
  now: Date = new Date(),
): Promise<Fixture[]> {
  return getFixturesPendingAutoScore(await getCollectionFixtureSlate(), now);
}



async function resolveFinalScoreFromTxLine(

  fixture: Fixture,

  now: Date = new Date(),

): Promise<{

  finalScore: { homeScore: number; awayScore: number } | null;

  live: LiveMatchData | null;

}> {

  const match = await fetchTxLineMatch(fixture, { fresh: true });

  if (!match) return { finalScore: null, live: null };



  const live = mapMatchRow(match);

  const finalScore = resolveFinalScoreFromTxLineMatch(

    match,

    fixtureDateTime(fixture).getTime(),

    now.getTime(),

    MINUTES_AFTER_KICKOFF_BEFORE_SCORE,

  );



  return { finalScore, live };

}



export type AutoScoreOptions = {
  /** Skip proof/scorer maintenance so callers can run collection first. */
  skipMaintenance?: boolean;
};

export async function runAutoScoreMaintenance(): Promise<{
  matchProof: Awaited<ReturnType<typeof retryMissingMatchProofs>>;
  matchGoals: Awaited<ReturnType<typeof retryIncompleteMatchGoalsBackfills>>;
}> {
  const matchProof = await retryMissingMatchProofs(getActiveFixtures()).catch(
    (error) => {
      console.warn(
        "[match-proof] Retry pass failed:",
        error instanceof Error ? error.message : error,
      );
      return {
        attempted: 0,
        stored: 0,
        semanticsRefreshed: 0,
        upgrade: {
          attempted: 0,
          upgraded: 0,
          skippedExpired: 0,
          stillWaiting: 0,
        },
      };
    },
  );
  if (
    matchProof.upgrade.upgraded > 0 ||
    matchProof.upgrade.attempted > 0 ||
    matchProof.stored > 0 ||
    matchProof.semanticsRefreshed > 0
  ) {
    console.info(
      `[match-proof] Maintenance: attempted=${matchProof.attempted} stored=${matchProof.stored} semanticsRefreshed=${matchProof.semanticsRefreshed} upgradeAttempted=${matchProof.upgrade.attempted} upgraded=${matchProof.upgrade.upgraded} waiting=${matchProof.upgrade.stillWaiting} expired=${matchProof.upgrade.skippedExpired}`,
    );
  }

  const matchGoals = await retryIncompleteMatchGoalsBackfills(
    getActiveFixtures(),
  ).catch((error) => {
    console.warn(
      "[match-goals] Scorer retry pass failed:",
      error instanceof Error ? error.message : error,
    );
    return { attempted: 0, backfilled: 0, skipped: 0, errors: 0, details: [] };
  });
  if (matchGoals.attempted > 0) {
    console.info(
      `[match-goals] Scorer retry: attempted=${matchGoals.attempted} backfilled=${matchGoals.backfilled} skipped=${matchGoals.skipped} errors=${matchGoals.errors}`,
    );
  }

  const bonusSettlement = await retryFirstGoalscorerBonusSettlement(
    getActiveFixtures(),
  ).catch((error) => {
    console.warn(
      "[first-goalscorer] Bonus settlement pass failed:",
      error instanceof Error ? error.message : error,
    );
    return [] as Awaited<ReturnType<typeof retryFirstGoalscorerBonusSettlement>>;
  });
  if (bonusSettlement.length > 0) {
    const doubled = bonusSettlement.reduce((sum, row) => sum + row.doubled, 0);
    const voided = bonusSettlement.filter((row) => row.status === "settled_void").length;
    console.info(
      `[first-goalscorer] Maintenance: processed=${bonusSettlement.length} doubled=${doubled} voided=${voided}`,
    );
  }

  return { matchProof, matchGoals };
}

export async function autoScoreFinishedMatches(
  fixtures: Fixture[] = FIXTURES,
  options?: AutoScoreOptions,
): Promise<AutoScoreResult[]> {
  const txlineConfigured = isTxLineConfigured();

  const results: AutoScoreResult[] = [];

  if (!txlineConfigured && !fixtures.some((fixture) => fixtureFinalScore(fixture))) {
    return [
      {
        matchId: 0,
        status: "skipped",
        reason:
          "TxLINE not configured (TXODDS_API_TOKEN) and no fixture.result set",
      },
    ];
  }

  const active = getActiveFixtures(fixtures);
  const candidates =
    fixtures.length < FIXTURES.length
      ? active
      : await getFixturesPendingAutoScore(active);

  for (const fixture of candidates) {

    try {

      if (await isMatchScored(fixture.id)) {

        results.push({

          matchId: fixture.id,

          status: "skipped",

          reason: "Already scored",

        });

        continue;

      }



      let finalScore: { homeScore: number; awayScore: number } | null = null;

      let source: "api" | "fixture.result" | null = null;

      let live: LiveMatchData | null = null;



      const fromFixture = fixtureFinalScore(fixture);

      if (fromFixture) {

        finalScore = fromFixture;

        source = "fixture.result";

      }



      if (!finalScore && txlineConfigured) {

        try {

          const resolved = await resolveFinalScoreFromTxLine(fixture);

          finalScore = resolved.finalScore;

          live = resolved.live;

          if (finalScore) source = "api";

        } catch (error) {

          if (error instanceof TxLineBudgetError) {

            results.push({

              matchId: fixture.id,

              status: "skipped",

              reason: error.message,

            });

            continue;

          }

          throw error;

        }

      }



      if (!finalScore) {

        if (live) {

          results.push({

            matchId: fixture.id,

            status: "pending",

            apiStatus: live.status,

          });

        } else {

          results.push({

            matchId: fixture.id,

            status: "skipped",

            reason: "Awaiting FT from API or set fixture.result",

          });

        }

        continue;

      }



      await ensureMatchOddsForFixture(fixture).catch(() => null);

      await scoreMatchPredictions(fixture.id, finalScore, fixture);

      await ensureMatchGoalsBackfilled(fixture.id, fixture);

      await fetchAndPersistMatchProof(fixture.id, fixture);

      results.push({

        matchId: fixture.id,

        status: "scored",

        homeScore: finalScore.homeScore,

        awayScore: finalScore.awayScore,

        source: source!,

      });

    } catch (error) {

      results.push({

        matchId: fixture.id,

        status: "error",

        error: error instanceof Error ? error.message : "Auto-score failed",

      });

    }

  }

  if (!options?.skipMaintenance) {
    await runAutoScoreMaintenance();
  }

  return results;
}

