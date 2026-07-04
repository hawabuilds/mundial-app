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
import {
  fetchAndPersistMatchProof,
  retryMissingMatchProofs,
} from "@/lib/matchProofFetch";

import {

  ApiFootballBudgetError,

  fetchApiMatch,

  isApiFootballConfigured,

  mapMatchRow,

  resolveFinalScoreFromApiMatch,

  type LiveMatchData,

} from "./apiFootball";

import { fixtureAutoSettlesFromApi } from "./fixtureAutoSettle";



/** Earliest auto-score check after kickoff (API must report FT). */

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



/** Regular time + ET/PEN + API lag — not days of polling. */
const AUTO_SCORE_MAX_HOURS_AFTER_KICKOFF = 4;



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
    if (elapsedMs < 0 || elapsedMs > maxAgeMs) continue;
    if (!isPastScoringWindow(fixture, now)) continue;

    if (await isMatchScored(fixture.id)) continue;



    const manualResult = fixtureFinalScore(fixture);

    const apiAutoSettle = fixtureAutoSettlesFromApi(fixture);
    const collected = await isEffectivelyCollected(fixture.id);
    if (!collected && !manualResult && !apiAutoSettle) {
      continue;
    }

    if (manualResult) {
      pending.push(fixture);
      continue;
    }

    // Poll API-Football every cron tick (5 min) from 90 min after kickoff until
    // the match is scored — bounded only by AUTO_SCORE_MAX_HOURS_AFTER_KICKOFF.
    // No fixed poll windows, so a finished match can never get stuck unscored.
    pending.push(fixture);

  }



  return pending;

}



async function resolveFinalScoreFromApi(

  fixture: Fixture,

  now: Date = new Date(),

): Promise<{

  finalScore: { homeScore: number; awayScore: number } | null;

  live: LiveMatchData | null;

}> {

  const match = await fetchApiMatch(fixture, { fresh: true });

  if (!match) return { finalScore: null, live: null };



  const live = mapMatchRow(match);

  const finalScore = resolveFinalScoreFromApiMatch(

    match,

    fixtureDateTime(fixture).getTime(),

    now.getTime(),

    MINUTES_AFTER_KICKOFF_BEFORE_SCORE,

  );



  return { finalScore, live };

}



export async function autoScoreFinishedMatches(

  fixtures: Fixture[] = FIXTURES,

): Promise<AutoScoreResult[]> {

  const apiConfigured = isApiFootballConfigured();

  const results: AutoScoreResult[] = [];



  if (!apiConfigured && !fixtures.some((fixture) => fixtureFinalScore(fixture))) {

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



      if (!finalScore && apiConfigured) {

        try {

          const resolved = await resolveFinalScoreFromApi(fixture);

          finalScore = resolved.finalScore;

          live = resolved.live;

          if (finalScore) source = "api";

        } catch (error) {

          if (error instanceof ApiFootballBudgetError) {

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

      await scoreMatchPredictions(fixture.id, finalScore);

      void fetchAndPersistMatchProof(fixture.id, fixture);

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

  void retryMissingMatchProofs(active).catch((error) => {
    console.warn(
      "[match-proof] Retry pass failed:",
      error instanceof Error ? error.message : error,
    );
  });

  return results;

}

