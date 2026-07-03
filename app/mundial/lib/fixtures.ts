import { getTeamCountryCode } from "@/app/data/fixtures";
import type {
  UpcomingMatch,
  FixturePhase,
  MatchGoalInfo,
  MatchMarketOdds,
} from "@/app/lib/leaderboard-client";
import {
  formatVenueLine,
  fixtureMetaLabel,
  getVenueForMatch,
} from "./venues";

export type MundialGoal = MatchGoalInfo;

export type MundialFixture = {
  id: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  date: string;
  time: string;
  group: string | null;
  venueLine: string;
  /** Live match state (null when not started / no feed data). */
  status: string | null;
  statusLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  elapsed: number | null;
  phase: FixturePhase;
  goals: MundialGoal[];
  /** Locked pre-kickoff 1X2 market (TxLINE). */
  marketOdds: MatchMarketOdds | null;
};

export function toMundialFixture(fixture: UpcomingMatch): MundialFixture {
  const venue = getVenueForMatch(fixture.id);
  const live = fixture.live ?? null;
  return {
    id: fixture.id,
    home: fixture.home,
    away: fixture.away,
    homeCode: getTeamCountryCode(fixture.home) ?? "UN",
    awayCode: getTeamCountryCode(fixture.away) ?? "UN",
    date: fixture.date,
    time: fixture.time,
    group: fixtureMetaLabel(fixture.group),
    venueLine:
      fixture.venueLine !== undefined
        ? fixture.venueLine
        : formatVenueLine(venue),
    status: live?.status ?? null,
    statusLabel: fixture.statusLabel ?? null,
    homeScore: live?.homeScore ?? null,
    awayScore: live?.awayScore ?? null,
    elapsed: live?.elapsed ?? null,
    phase: fixture.phase ?? "upcoming",
    goals: fixture.goals ?? [],
    marketOdds: fixture.marketOdds ?? null,
  };
}

const FALLBACK_LIVE = {
  status: null,
  statusLabel: null,
  homeScore: null,
  awayScore: null,
  elapsed: null,
  phase: "upcoming" as const,
  goals: [] as MundialGoal[],
  marketOdds: null,
};

export const FALLBACK_FIXTURES: MundialFixture[] = [
  {
    id: 6,
    home: "Brazil",
    away: "Morocco",
    homeCode: "BR",
    awayCode: "MA",
    date: "2026-06-13",
    time: "22:00",
    group: null,
    venueLine: "Lincoln Financial Field · Philadelphia, USA",
    ...FALLBACK_LIVE,
  },
  {
    id: 4,
    home: "USA",
    away: "Paraguay",
    homeCode: "US",
    awayCode: "PY",
    date: "2026-06-13",
    time: "01:00",
    group: null,
    venueLine: "SoFi Stadium · Los Angeles, USA",
    ...FALLBACK_LIVE,
  },
  {
    id: 5,
    home: "Qatar",
    away: "Switzerland",
    homeCode: "QA",
    awayCode: "CH",
    date: "2026-06-13",
    time: "19:00",
    group: null,
    venueLine: "Levi's Stadium · Santa Clara, USA",
    ...FALLBACK_LIVE,
  },
];
