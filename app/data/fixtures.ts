export type Fixture = {
  id: number;
  home: string;
  away: string;
  date: string;
  time: string;
  group: string;
  /**
   * Fetch final score from API-Football after full time (90+injury) without waiting
   * for X collection. Defaults on for group names containing "World Cup".
   */
  autoSettleFromApi?: boolean;
  /** When true, match is void — no collection, scoring, or UI listing. */
  cancelled?: boolean;
  tweetId?: string;
  /**
   * Legacy api-football.com fixture id. No longer used for lookups — live scores
   * and auto-scoring resolve fixtures against TxLINE by team name + kickoff
   * (see lib/txodds.ts). Kept only so existing fixture data stays valid.
   */
  externalFixtureId?: number;
  /** Set when the final score is known — used by score-predictions / score cron. */
  result?: {
    homeScore: number;
    awayScore: number;
  };
};

import { WORLD_CUP_2026_FIXTURES } from "./worldCup2026Fixtures";
import { teamNamesMatch } from "@/lib/teamNames";

/** Re-enable full tournament: spread `...WORLD_CUP_2026_FIXTURES` into FIXTURES below. */
export { WORLD_CUP_2026_FIXTURES };

/**
 * Flag codes for country-flag-icons/react/3x2 (ISO 3166-1 alpha-2 or GB subdivisions).
 * UK home nations use GB_ENG, GB_SCT, GB_WLS, GB_NIR — not the Union Jack (GB).
 */
export type CountryCode = string;

export const TEAM_COUNTRY_CODES: Record<string, CountryCode> = {
  Iran: "IR",
  Gambia: "GM",
  "South Africa": "ZA",
  Nicaragua: "NI",
  Iraq: "IQ",
  Andorra: "AD",
  Lebanon: "LB",
  Sudan: "SD",
  "Bosnia & Herzegovina": "BA",
  "FYR Macedonia": "MK",
  Scotland: "GB_SCT",
  England: "GB_ENG",
  Wales: "GB_WLS",
  "Northern Ireland": "GB_NIR",
  "Curaçao": "CW",
  Poland: "PL",
  Ukraine: "UA",
  Germany: "DE",
  Finland: "FI",
  USA: "US",
  Senegal: "SN",
  Brazil: "BR",
  Panama: "PA",
  Slovakia: "SK",
  Malta: "MT",
  Norway: "NO",
  Sweden: "SE",
  Türkiye: "TR",
  "North Macedonia": "MK",
  Mexico: "MX",
  "South Korea": "KR",
  "Czech Republic": "CZ",
  Canada: "CA",
  Paraguay: "PY",
  Qatar: "QA",
  Switzerland: "CH",
  Morocco: "MA",
  Haiti: "HT",
  Australia: "AU",
  Netherlands: "NL",
  Japan: "JP",
  "Ivory Coast": "CI",
  Ecuador: "EC",
  Tunisia: "TN",
  Spain: "ES",
  "Cape Verde Islands": "CV",
  Belgium: "BE",
  Egypt: "EG",
  "Saudi Arabia": "SA",
  Uruguay: "UY",
  "New Zealand": "NZ",
  France: "FR",
  Argentina: "AR",
  Algeria: "DZ",
  Austria: "AT",
  Jordan: "JO",
  Portugal: "PT",
  "Congo DR": "CD",
  Croatia: "HR",
  Ghana: "GH",
  Uzbekistan: "UZ",
  Colombia: "CO",
  "Cape Verde": "CV",
  Vietnam: "VN",
  Myanmar: "MM",
};

export function getTeamCountryCode(team: string): CountryCode | null {
  if (TEAM_COUNTRY_CODES[team]) {
    return TEAM_COUNTRY_CODES[team]!;
  }

  const lower = team.trim().toLowerCase();
  if (lower === "scotland" || lower.includes("scotland")) return "GB_SCT";
  if (lower === "england" || lower.includes("england")) return "GB_ENG";
  if (lower === "wales" || lower.includes("wales")) return "GB_WLS";
  if (lower.includes("northern ireland")) return "GB_NIR";

  return null;
}

/**
 * Do not reuse match_ids that already have predictions in Supabase.
 * World Cup 2026: ids 1–81 in app/data/worldCup2026Fixtures.ts.
 *
 * Match posts: set tweetId from @copamundialapp when the post is live (best reliability).
 * Otherwise sync/kickoff crons validate cache + search X before collection.
 */

/** Active slate — FIFA World Cup 2026 (group stage + Round of 32). */
export const FIXTURES: Fixture[] = [...WORLD_CUP_2026_FIXTURES];

const KICKOFF_MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Resolve a static registry row by team names and kickoff (board / TxLINE). */
export function findFixtureByTeamsAndKickoff(
  home: string,
  away: string,
  kickoffUtcMs: number,
  fixtures: Fixture[] = FIXTURES,
): Fixture | undefined {
  let best: Fixture | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const fixture of fixtures) {
    const normal =
      teamNamesMatch(fixture.home, home) && teamNamesMatch(fixture.away, away);
    const flipped =
      teamNamesMatch(fixture.home, away) && teamNamesMatch(fixture.away, home);
    if (!normal && !flipped) continue;

    const delta = Math.abs(fixtureDateTime(fixture).getTime() - kickoffUtcMs);
    if (delta > KICKOFF_MATCH_WINDOW_MS) continue;
    if (delta < bestDelta) {
      best = fixture;
      bestDelta = delta;
    }
  }

  return best;
}

export function getFixtureById(
  matchId: number,
  fixtures: Fixture[] = FIXTURES,
): Fixture | undefined {
  return fixtures.find((fixture) => fixture.id === matchId);
}

/** Stable id for the teams on a match row — invalidates cached tweet ids when fixtures change. */
export function fixtureCacheKey(
  fixture: Pick<Fixture, "home" | "away" | "date">,
): string {
  return `${fixture.home}|${fixture.away}|${fixture.date}`;
}

export function fixtureDateTime(
  fixture: Pick<Fixture, "date" | "time">,
): Date {
  return new Date(`${fixture.date}T${fixture.time}:00Z`);
}

/** True while kickoff is still in the future (predictions open). */
export function isFixtureCancelled(fixture: Pick<Fixture, "cancelled">): boolean {
  return Boolean(fixture.cancelled);
}

export function getActiveFixtures(
  fixtures: Fixture[] = FIXTURES,
): Fixture[] {
  return fixtures.filter((fixture) => !isFixtureCancelled(fixture));
}

export function isFixtureNotStarted(
  fixture: Fixture,
  now: Date = new Date(),
): boolean {
  if (isFixtureCancelled(fixture)) return false;
  return fixtureDateTime(fixture) > now;
}

export function getUpcomingFixtures(
  fixtures: Fixture[] = FIXTURES,
  now: Date = new Date(),
): Fixture[] {
  return getActiveFixtures(fixtures)
    .filter((fixture) => isFixtureNotStarted(fixture, now))
    .sort(
      (a, b) => fixtureDateTime(a).getTime() - fixtureDateTime(b).getTime(),
    );
}

export function isWorldCupFixture(
  fixture: Pick<Fixture, "group">,
): boolean {
  return /world\s*cup/i.test(fixture.group);
}

export const LANDING_DAY_WINDOW = 2;

/**
 * Landing page: upcoming fixtures for a sliding UTC date window.
 */
export function getLandingFixturesForWindow(
  fixtures: Fixture[] = FIXTURES,
  now: Date = new Date(),
  startDateIndex = 0,
  dayCount = LANDING_DAY_WINDOW,
): Fixture[] {
  const upcoming = getUpcomingFixtures(fixtures, now);
  const dates = getUpcomingDateWindow(upcoming, startDateIndex, dayCount);
  return getUpcomingFixturesForDates(upcoming, dates);
}

export function getUniqueUpcomingDates(
  upcoming: Pick<Fixture, "date">[],
): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const fixture of upcoming) {
    if (seen.has(fixture.date)) continue;
    seen.add(fixture.date);
    dates.push(fixture.date);
  }
  return dates;
}

export function getUpcomingDateWindow(
  upcoming: Pick<Fixture, "date">[],
  startDateIndex: number,
  dayCount = LANDING_DAY_WINDOW,
): string[] {
  return getUniqueUpcomingDates(upcoming).slice(
    startDateIndex,
    startDateIndex + dayCount,
  );
}

export function getUpcomingFixturesForDates<T extends Pick<Fixture, "date">>(
  upcoming: T[],
  dates: string[],
): T[] {
  if (dates.length === 0) return [];
  const allowed = new Set(dates);
  return upcoming.filter((fixture) => allowed.has(fixture.date));
}

export function getNextFixture(
  fixtures: Fixture[] = FIXTURES,
  now: Date = new Date(),
): Fixture | null {
  return getUpcomingFixtures(fixtures, now)[0] ?? null;
}

export function fixtureKickoffKey(
  fixture: Pick<Fixture, "date" | "time">,
): string {
  return `${fixture.date}T${fixture.time}`;
}

/** Earliest upcoming kickoff slot — one fixture, or all sharing that time. */
export function getNextKickoffSlotFixtures<T extends Pick<Fixture, "date" | "time">>(
  upcoming: T[],
): T[] {
  if (upcoming.length === 0) return [];
  const slot = fixtureKickoffKey(upcoming[0]!);
  return upcoming.filter((fixture) => fixtureKickoffKey(fixture) === slot);
}

/** Upcoming fixtures on a given UTC date (YYYY-MM-DD). */
export function getUpcomingFixturesOnDate<T extends Pick<Fixture, "date">>(
  upcoming: T[],
  date: string,
): T[] {
  return upcoming.filter((fixture) => fixture.date === date);
}

export function formatKickoffUtc(fixture: Fixture): string {
  return `${fixture.time} UTC`;
}

export function formatFixtureKickoffLine(fixture: Fixture): string {
  return `${formatFixtureDateShort(fixture.date)} · ${formatKickoffUtc(fixture)}`;
}

export function formatFixtureLabel(fixture: Fixture): string {
  return `${fixture.home} vs ${fixture.away}`;
}

export function formatFixtureModalSub(fixture: Fixture): string {
  return `${formatFixtureLabel(fixture)} · ${formatFixtureDateShort(fixture.date)}, ${formatKickoffUtc(fixture)}`;
}

export function formatExampleScore(fixture: Fixture): string {
  return `${fixture.home} 2 – 1 ${fixture.away}`;
}

export function formatGroupLine(fixture: Fixture): string {
  return `${formatKickoffUtc(fixture)} · ${fixture.group}`;
}

export function formatFixtureDateShort(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatNextMatchBadge(fixture: Fixture): string {
  const today = new Date();
  const kickoff = fixtureDateTime(fixture);
  const isToday =
    kickoff.getUTCFullYear() === today.getUTCFullYear() &&
    kickoff.getUTCMonth() === today.getUTCMonth() &&
    kickoff.getUTCDate() === today.getUTCDate();

  return isToday ? "Today" : formatFixtureDateShort(fixture.date);
}
