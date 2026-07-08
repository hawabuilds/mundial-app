import type { Fixture } from "@/app/data/fixtures";
import { fixtureDateTime, getActiveFixtures } from "@/app/data/fixtures";
import { fixtureAutoSettlesFromApi } from "@/lib/fixtureAutoSettle";
import {
  fetchLiveMatch,
  isApiFootballConfigured,
  isFinishedStatus,
  isStartedOrFinishedStatus,
  type LiveMatchData,
} from "./txMatchSettlement";
import { liveFromFixtureResult } from "./txMatchSettlementCache";

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

  try {
    return await fetchLiveMatch(fixture);
  } catch {
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
      shouldEnrichFixtureFromApi(fixture, now) && apiCalls < maxApiCalls;

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

/**
 * When the live feed has no data yet, assume a match is still in progress for
 * this long after kickoff (90 + halftime + stoppage + a safety buffer).
 */
export const MATCH_ASSUMED_DURATION_MIN = 130;

/**
 * Live board keeps polling through extra time and penalties
 * (≈90 + 15 + 15 + 30 ET + 30 pens + buffer).
 */
export const BOARD_MATCH_MAX_MIN = 210;

/** Extra live lookups allowed for the board — covers simultaneous kickoffs. */
export const BOARD_API_MAX_CALLS = 6;

export type FixturePhase = "live" | "recent" | "upcoming";

export type BoardFixture = EnrichedFixture & { phase: FixturePhase };

function isFixtureFinished(
  fixture: Fixture,
  live: LiveMatchData | null,
  now: Date,
): boolean {
  if (fixture.result) return true;
  if (live) return isFinishedStatus(live.status);
  const kickoffMs = fixtureDateTime(fixture).getTime();
  return now.getTime() - kickoffMs >= MATCH_ASSUMED_DURATION_MIN * 60_000;
}

/**
 * Fixtures for the app's live board. Unlike {@link enrichUpcomingFixtures}, a
 * match is kept on screen once it kicks off:
 *  - "live": started and not yet finished — shows running clock + score.
 *  - "recent": finished — stays until the next board kickoff or 8h after kickoff,
 *    whichever comes first.
 *  - "upcoming": not started yet.
 * Ordered live first, then recent, then upcoming (each by kickoff).
 */
export async function enrichBoardFixtures(
  fixtures: Fixture[],
  now: Date = new Date(),
): Promise<BoardFixture[]> {
  const active = getActiveFixtures(fixtures);

  const kickoffs = Array.from(
    new Set(active.map((f) => fixtureDateTime(f).getTime())),
  ).sort((a, b) => a - b);
  const nextKickoffAfter = (ms: number): number => {
    for (const k of kickoffs) if (k > ms) return k;
    return Number.POSITIVE_INFINITY;
  };

  // Started matches sort earliest, so they win the live-lookup budget first.
  const enriched = await enrichFixtures(active, {
    now,
    maxApiCalls: BOARD_API_MAX_CALLS,
  });

  const board: BoardFixture[] = [];
  const nowMs = now.getTime();

  for (const fixture of enriched) {
    const kickoffMs = fixtureDateTime(fixture).getTime();

    if (kickoffMs > nowMs) {
      board.push({ ...fixture, phase: "upcoming" });
      continue;
    }

    if (!isFixtureFinished(fixture, fixture.live, now)) {
      board.push({ ...fixture, phase: "live" });
      continue;
    }

    // Finished: keep the result up until the next match begins.
    if (nowMs < nextKickoffAfter(kickoffMs)) {
      board.push({ ...fixture, phase: "recent" });
    }
  }

  const phaseRank: Record<FixturePhase, number> = {
    live: 0,
    recent: 1,
    upcoming: 2,
  };
  board.sort((a, b) => {
    const byPhase = phaseRank[a.phase] - phaseRank[b.phase];
    if (byPhase !== 0) return byPhase;
    return fixtureDateTime(a).getTime() - fixtureDateTime(b).getTime();
  });

  return board;
}

export function formatMatchStatus(live: LiveMatchData | null): string | null {
  if (!live) return null;

  if (live.status === "P") {
    return "Penalties";
  }

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
