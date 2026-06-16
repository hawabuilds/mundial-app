import type { FootballDataMatch, LiveMatchData } from "./apiFootball";

/** In-process cache — dedupes cron + UI within the same server instance. */
const fixtureCache = new Map<
  number,
  { match: FootballDataMatch | null; expiresAt: number }
>();

let dailyRemaining: number | null = null;
let dailyLimit: number | null = null;

/** Stop calling API when remaining daily quota is at or below this (cron reserve). */
export const API_FOOTBALL_MIN_RESERVE = 15;

/** Default TTL when quota headers are unknown. */
export const FIXTURE_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * In-progress fixtures during score poll windows.
 * Matches kickoff/score-finished cron interval (5 min) so the next tick can see FT
 * without extra poll windows. Terminal results still use {@link FIXTURE_CACHE_TTL_MS}.
 */
export const FIXTURE_CACHE_LIVE_TTL_MS = 5 * 60 * 1000;

export class ApiFootballBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballBudgetError";
  }
}

export function updateQuotaFromHeaders(headers: Headers): void {
  const remaining = headers.get("x-ratelimit-requests-remaining");
  const limit = headers.get("x-ratelimit-requests-limit");
  if (remaining != null) {
    const parsed = Number.parseInt(remaining, 10);
    if (!Number.isNaN(parsed)) dailyRemaining = parsed;
  }
  if (limit != null) {
    const parsed = Number.parseInt(limit, 10);
    if (!Number.isNaN(parsed)) dailyLimit = parsed;
  }
}

export function markQuotaExhausted(): void {
  dailyRemaining = 0;
}

export function getApiFootballQuota(): {
  remaining: number | null;
  limit: number | null;
} {
  return { remaining: dailyRemaining, limit: dailyLimit };
}

export function canUseApiFootball(minReserve = API_FOOTBALL_MIN_RESERVE): boolean {
  if (dailyRemaining === null) return true;
  return dailyRemaining > minReserve;
}

export function getCachedFixture(
  externalFixtureId: number,
  nowMs: number = Date.now(),
): FootballDataMatch | null | undefined {
  const entry = fixtureCache.get(externalFixtureId);
  if (!entry || entry.expiresAt <= nowMs) return undefined;
  return entry.match;
}

export function setCachedFixture(
  externalFixtureId: number,
  match: FootballDataMatch | null,
  ttlMs: number = FIXTURE_CACHE_TTL_MS,
): void {
  fixtureCache.set(externalFixtureId, {
    match,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearFixtureCache(): void {
  fixtureCache.clear();
}

export function liveFromFixtureResult(
  fixture: {
    externalFixtureId?: number;
    result?: { homeScore: number; awayScore: number };
  },
): LiveMatchData | null {
  if (!fixture.result) return null;
  return {
    externalFixtureId: fixture.externalFixtureId ?? 0,
    status: "FT",
    homeScore: fixture.result.homeScore,
    awayScore: fixture.result.awayScore,
    elapsed: null,
  };
}
