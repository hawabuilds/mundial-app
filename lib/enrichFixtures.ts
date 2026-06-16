import type { Fixture } from "@/app/data/fixtures";
import { fixtureDateTime } from "@/app/data/fixtures";
import { fixtureAutoSettlesFromApi } from "@/lib/fixtureAutoSettle";
import {
  ApiFootballBudgetError,
  fetchLiveMatch,
  isApiFootballConfigured,
  isFinishedStatus,
  isStartedOrFinishedStatus,
  type LiveMatchData,
} from "./apiFootball";
import { liveFromFixtureResult } from "./apiFootballCache";

export type EnrichedFixture = Fixture & {
  live: LiveMatchData | null;
  apiConfigured: boolean;
};

/** Only call API for fixtures near kickoff (saves quota on old/future games). */
export const ENRICH_API_HOURS_BEFORE_KICKOFF = 36;
export const ENRICH_API_HOURS_AFTER_KICKOFF = 4;
export const ENRICH_API_HOURS_AFTER_KICKOFF_WORLD_CUP = 6;

/** Max live API lookups per /api/matches request. */
export const ENRICH_API_MAX_CALLS_PER_REQUEST = 2;

export function shouldEnrichFixtureFromApi(
  fixture: Fixture,
  now: Date = new Date(),
): boolean {
  if (fixture.result) return false;

  const kickoffMs = fixtureDateTime(fixture).getTime();
  const hoursUntil = (kickoffMs - now.getTime()) / (60 * 60 * 1000);
  const hoursSince = -hoursUntil;

  const maxHoursAfter = fixtureAutoSettlesFromApi(fixture)
    ? ENRICH_API_HOURS_AFTER_KICKOFF_WORLD_CUP
    : ENRICH_API_HOURS_AFTER_KICKOFF;

  return (
    hoursUntil <= ENRICH_API_HOURS_BEFORE_KICKOFF &&
    hoursSince <= maxHoursAfter
  );
}

async function resolveLive(fixture: Fixture): Promise<LiveMatchData | null> {
  const fromResult = liveFromFixtureResult(fixture);
  if (fromResult) return fromResult;

  if (!isApiFootballConfigured() || !shouldEnrichFixtureFromApi(fixture)) {
    return null;
  }

  if (!fixture.externalFixtureId) return null;

  try {
    return await fetchLiveMatch(fixture.externalFixtureId);
  } catch (error) {
    if (error instanceof ApiFootballBudgetError) return null;
    return null;
  }
}

export async function enrichFixture(fixture: Fixture): Promise<EnrichedFixture> {
  const live = await resolveLive(fixture);
  return {
    ...fixture,
    live,
    apiConfigured: isApiFootballConfigured(),
  };
}

export async function enrichFixtures(
  fixtures: Fixture[],
  options?: { maxApiCalls?: number; now?: Date },
): Promise<EnrichedFixture[]> {
  const now = options?.now ?? new Date();
  const maxApiCalls = options?.maxApiCalls ?? ENRICH_API_MAX_CALLS_PER_REQUEST;
  let apiCalls = 0;

  const sorted = [...fixtures].sort(
    (a, b) => fixtureDateTime(a).getTime() - fixtureDateTime(b).getTime(),
  );

  const results: EnrichedFixture[] = [];

  for (const fixture of sorted) {
    const fromResult = liveFromFixtureResult(fixture);
    if (fromResult) {
      results.push({
        ...fixture,
        live: fromResult,
        apiConfigured: isApiFootballConfigured(),
      });
      continue;
    }

    const mayUseApi =
      shouldEnrichFixtureFromApi(fixture, now) &&
      fixture.externalFixtureId &&
      apiCalls < maxApiCalls;

    if (!mayUseApi) {
      results.push({
        ...fixture,
        live: null,
        apiConfigured: isApiFootballConfigured(),
      });
      continue;
    }

    apiCalls += 1;
    results.push(await enrichFixture(fixture));
  }

  return results;
}

/** Drop fixtures once kickoff passes or the API reports they have started. */
export function isFixtureUpcoming(
  fixture: Fixture,
  live: LiveMatchData | null,
  now: Date = new Date(),
): boolean {
  if (fixtureDateTime(fixture) <= now) return false;
  if (live && isStartedOrFinishedStatus(live.status)) return false;
  return true;
}

export async function enrichUpcomingFixtures(
  fixtures: Fixture[],
  now: Date = new Date(),
): Promise<EnrichedFixture[]> {
  const notStarted = fixtures.filter((f) => fixtureDateTime(f) > now);
  const enriched = await enrichFixtures(notStarted, { now });
  return enriched.filter((fixture) => isFixtureUpcoming(fixture, fixture.live, now));
}

export async function enrichNextFixture(
  fixtures: Fixture[],
  now: Date = new Date(),
): Promise<EnrichedFixture | null> {
  const upcoming = await enrichUpcomingFixtures(fixtures, now);
  return upcoming[0] ?? null;
}

export function formatMatchStatus(live: LiveMatchData | null): string | null {
  if (!live) return null;

  if (isFinishedStatus(live.status)) {
    return `FT ${live.homeScore}–${live.awayScore}`;
  }

  if (live.status === "NS") return "Not started";
  if (live.status === "HT") return `HT ${live.homeScore ?? 0}–${live.awayScore ?? 0}`;
  if (live.elapsed !== null) {
    return `LIVE ${live.elapsed}' · ${live.homeScore ?? 0}–${live.awayScore ?? 0}`;
  }

  return live.status;
}
