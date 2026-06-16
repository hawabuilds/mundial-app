import type { Fixture } from "@/app/data/fixtures";

import {
  FIXTURES,
  fixtureDateTime,
  getActiveFixtures,
  isFixtureCancelled,
} from "@/app/data/fixtures";

import {
  getMatchState,
  isEffectivelyCollected,
  isMatchScored,
  scoreMatchPredictions,
} from "@/app/lib/supabase";

import {

  ApiFootballBudgetError,

  fetchApiMatch,

  isApiFootballConfigured,

  mapMatchRow,

  resolveFinalScoreFromApiMatch,

  type LiveMatchData,

} from "./apiFootball";

import {
  fixtureAutoSettlesFromApi,
  WORLD_CUP_SCORE_POLL_EXTRA_MINUTES,
} from "./fixtureAutoSettle";
import {
  isScoreApiPollDue,
  SCORE_API_POLL_OFFSETS_MINUTES,
  SCORE_API_POLL_WINDOW_MINUTES,
} from "./scoreApiSchedule";



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



/** Stop API polling this long after the last scheduled poll window. */

export function isWithinScoreApiPollingPeriod(

  fixture: Fixture,

  now: Date = new Date(),

): boolean {

  const kickoffMs = fixtureDateTime(fixture).getTime();

  const elapsedMin = (now.getTime() - kickoffMs) / 60_000;

  const lastOffset = SCORE_API_POLL_OFFSETS_MINUTES.at(-1)!;
  const tailMinutes =
    SCORE_API_POLL_WINDOW_MINUTES +
    30 +
    (fixtureAutoSettlesFromApi(fixture) ? WORLD_CUP_SCORE_POLL_EXTRA_MINUTES : 0);

  return elapsedMin < lastOffset + tailMinutes;

}



/** Fixtures that may need an API-Football score check (past window, not yet scored). */

export function getFixturesDueForAutoScore(

  fixtures: Fixture[] = FIXTURES,

  now: Date = new Date(),

): Fixture[] {

  return fixtures.filter((fixture) => isPastScoringWindow(fixture, now));

}



const AUTO_SCORE_MAX_HOURS_AFTER_KICKOFF = 72;



/**

 * Unscored matches worth scoring — API only in scheduled poll windows.

 * `fixture.result` can score any time without API.

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



    const state = await getMatchState(fixture.id);
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



    if (!isWithinScoreApiPollingPeriod(fixture, now)) continue;

    if (!isScoreApiPollDue(fixture, now)) continue;

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

  if (!fixture.externalFixtureId) {

    return { finalScore: null, live: null };

  }



  const match = await fetchApiMatch(fixture.externalFixtureId);

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

          "API_FOOTBALL_KEY not configured and no fixture.result set",

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

            reason:

              "Awaiting FT from API (poll windows) or set fixture.result",

          });

        }

        continue;

      }



      await scoreMatchPredictions(fixture.id, finalScore);



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



  return results;

}

