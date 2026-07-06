import { getTeamCountryCode } from "@/app/data/fixtures";
import type {
  UpcomingMatch,
  FixturePhase,
  MatchGoalInfo,
  MatchMarketOdds,
  MatchTxLineProof,
} from "@/app/lib/leaderboard-client";
import { endedAfterRegulation } from "@/lib/txScoreProofSemantics";
import { matchStageLabel } from "@/lib/matchStage";
import { formatVenueLine, getVenueForMatch } from "./venues";

export type MundialGoal = MatchGoalInfo;

type CurrentMatchLike = {
  id: number;
  phase?: FixturePhase;
  status?: string | null;
  kickoffUtcMs?: number;
  date?: string;
  time?: string;
};

function kickoffSortKey(fixture: Pick<CurrentMatchLike, "kickoffUtcMs" | "date" | "time">): number {
  if (fixture.kickoffUtcMs != null && Number.isFinite(fixture.kickoffUtcMs)) {
    return fixture.kickoffUtcMs;
  }
  if (fixture.date && fixture.time) {
    return Date.parse(`${fixture.date}T${fixture.time}:00Z`);
  }
  return Number.POSITIVE_INFINITY;
}

export function sortFixturesByKickoffAsc<T extends CurrentMatchLike>(fixtures: T[]): T[] {
  return [...fixtures].sort((a, b) => kickoffSortKey(a) - kickoffSortKey(b));
}

/** Live match in play, otherwise the most recent FT card, otherwise next upcoming. */
export function resolveCurrentMatch<T extends CurrentMatchLike>(
  fixtures: T[],
): T | null {
  const liveNow = fixtures.find(
    (f) =>
      f.phase === "live" || f.status === "LIVE" || f.status === "HT",
  );
  if (liveNow) return liveNow;
  const recent = fixtures.find((f) => f.phase === "recent");
  if (recent) return recent;
  return sortFixturesByKickoffAsc(fixtures.filter((f) => f.phase === "upcoming"))[0] ?? null;
}

export type MundialFixture = {
  id: number;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  date: string;
  time: string;
  stage: string | null;
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
  /** TxLINE on-chain score proof when available. */
  txlineProof?: MatchTxLineProof | null;
  /** TxLINE terminal status (5=FT, 10=AET, 13=FPE). */
  terminalStatusId?: number | null;
  /** Epoch ms (UTC) from TxLINE StartTime when available. */
  kickoffUtcMs?: number;
};

export function settledOnRegulationScore(terminalStatusId?: number | null): boolean {
  return endedAfterRegulation(terminalStatusId);
}

export function toMundialFixture(fixture: UpcomingMatch): MundialFixture {
  const venue = getVenueForMatch(fixture.id);
  const live = fixture.live ?? null;
  const phase = fixture.phase ?? "upcoming";
  const goals = fixture.goals ?? [];

  let homeScore = live?.homeScore ?? null;
  let awayScore = live?.awayScore ?? null;

  const liveStatus =
    live?.status ??
    (phase === "live" ? "LIVE" : phase === "recent" ? "FT" : null);
  const inPlay =
    phase === "live" ||
    liveStatus === "LIVE" ||
    liveStatus === "HT" ||
    liveStatus === "1H" ||
    liveStatus === "2H" ||
    liveStatus === "ET" ||
    liveStatus === "P";
  if (inPlay) {
    if (homeScore == null) homeScore = 0;
    if (awayScore == null) awayScore = 0;
  }

  if (homeScore == null && awayScore == null && phase !== "upcoming" && goals.length > 0) {
    const fromGoals = { home: 0, away: 0 };
    for (const goal of goals) {
      if (goal.side === "home") fromGoals.home += 1;
      else fromGoals.away += 1;
    }
    homeScore = fromGoals.home;
    awayScore = fromGoals.away;
  }

  const status = liveStatus;

  const stage = matchStageLabel(fixture.group, {
    matchId: fixture.id,
    fixtureGroupId: fixture.fixtureGroupId,
    date: fixture.date,
  });

  return {
    id: fixture.id,
    home: fixture.home,
    away: fixture.away,
    homeCode: getTeamCountryCode(fixture.home) ?? "UN",
    awayCode: getTeamCountryCode(fixture.away) ?? "UN",
    date: fixture.date,
    time: fixture.time,
    stage,
    venueLine:
      fixture.venueLine !== undefined
        ? fixture.venueLine
        : formatVenueLine(venue),
    status,
    statusLabel: fixture.statusLabel ?? null,
    homeScore,
    awayScore,
    elapsed: live?.elapsed ?? null,
    phase,
    goals,
    marketOdds: fixture.marketOdds ?? null,
    txlineProof: fixture.txlineProof ?? null,
    terminalStatusId: fixture.terminalStatusId ?? null,
    kickoffUtcMs: fixture.kickoffUtcMs,
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
    stage: "Group stage",
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
    stage: "Group stage",
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
    stage: "Group stage",
    venueLine: "Levi's Stadium · Santa Clara, USA",
    ...FALLBACK_LIVE,
  },
];
