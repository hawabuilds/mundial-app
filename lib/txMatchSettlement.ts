// TxLINE match settlement adapter (live scores, FT resolution, status vocabulary).
//
// Data source is TxLINE (TxODDS) — see lib/txodds.ts. Types and helpers here
// power scoring, cron, and the live UI board.

export type LiveMatchData = {
  externalFixtureId: number;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  elapsed: number | null;
};

import {
  extractDisplayScores,
  extractLiveScores,
  extractSettlementScores,
  isTerminalMatchStatus,
  type MatchScores,
} from "@/lib/matchScoreSettlement";

import {
  fetchScoresSnapshot,
  isTxoddsConfigured,
  latestScoreEvent,
  resolveTxFixture,
  teamNamesMatch,
  type TxFixture,
  type TxScoreEvent,
} from "./txodds";

import {
  matchGoalsFromEvents,
  persistTxlineGoals,
  resolveMatchGoalsForDisplay,
} from "./matchGoalsPersist";
import {
  FIXTURE_CACHE_LIVE_TTL_MS,
  FIXTURE_CACHE_TTL_MS,
  getCachedFixture,
  setCachedFixture,
} from "./txMatchSettlementCache";

/** Normalized fixture row used by scoring + live UI. */
export type FootballDataMatch = {
  id: number;
  status: string;
  minute?: number | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score?: MatchScores;
};

/** Enough of a fixture to resolve it against the TxLINE schedule. */
export type MatchLookup = {
  /** TxLINE FixtureId — when set, scores are fetched directly (no snapshot lookup). */
  id?: number;
  home: string;
  away: string;
  date: string;
  time: string;
};

export function isApiFootballConfigured(): boolean {
  return isTxoddsConfigured();
}

export function isFootballDataConfigured(): boolean {
  return isApiFootballConfigured();
}

// ---------------------------------------------------------------------------
// TxLINE soccer game-phase encoding -> internal status codes
// (internal codes match the old api-football short codes so downstream logic,
//  mapStatus(), and isTerminalMatchStatus() keep working unchanged).
// ---------------------------------------------------------------------------

function mapStatusIdToShort(statusId: number): string {
  switch (statusId) {
    case 1:
      return "NS"; // Not started
    case 2:
      return "1H"; // First half
    case 3:
      return "HT"; // Halftime
    case 4:
      return "2H"; // Second half
    case 5:
      return "FT"; // Ended
    case 6:
      return "HT"; // Waiting for extra time
    case 7:
    case 9:
      return "ET"; // Extra time in play
    case 8:
      return "HT"; // Extra-time halftime
    case 10:
    case 100:
      return "AET"; // Ended after extra time
    case 11:
    case 12:
      return "P"; // Penalty shootout (waiting / in progress)
    case 13:
      return "PEN"; // Ended after penalties
    case 14:
      return "LIVE"; // Interrupted
    case 15:
      return "ABD"; // Abandoned
    case 16:
    case 17:
      return "CANC"; // Cancelled / coverage cancelled
    case 18:
      return "SUSP"; // Coverage suspended
    case 19:
      return "PST"; // Postponed
    default:
      return "NS";
  }
}

/** Map internal short status to the label vocabulary the UI/live layer expects. */
function mapStatus(status: string): string {
  switch (status) {
    case "FT":
    case "AET":
    case "PEN":
      return "FT";
    case "HT":
    case "BT":
      return "HT";
    case "1H":
    case "2H":
    case "ET":
    case "P":
    case "LIVE":
      return "LIVE";
    case "NS":
    case "TBD":
    case "PST":
      return "NS";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Decode a TxLINE score event into a normalized FootballDataMatch
// ---------------------------------------------------------------------------

function statVal(event: TxScoreEvent, key: number): number | null {
  const v = event.Stats?.[String(key)];
  return typeof v === "number" ? v : null;
}

/** Total + regulation (H1+H2) goals for a participant (1 or 2). */
function goalsFor(
  event: TxScoreEvent,
  participant: 1 | 2,
): { total: number | null; regulation: number | null } {
  const total = statVal(event, participant);
  // TxLINE: 1000+P = H1, 3000+P = H2 (2000+P is not second-half goals).
  const h1 = statVal(event, 1000 + participant);
  const h2 = statVal(event, 3000 + participant);
  let regulation: number | null = null;
  if (h1 != null || h2 != null) regulation = (h1 ?? 0) + (h2 ?? 0);

  if (total != null || regulation != null) return { total, regulation };

  // Fallback to the structured Score object when Stats is absent.
  const side = participant === 1 ? event.Score?.Participant1 : event.Score?.Participant2;
  if (side) {
    const t = side.Total?.Goals ?? null;
    const r =
      side.H1?.Goals != null || side.H2?.Goals != null
        ? (side.H1?.Goals ?? 0) + (side.H2?.Goals ?? 0)
        : null;
    return { total: t, regulation: r };
  }
  return { total: null, regulation: null };
}

const TERMINAL_STATUS_IDS = new Set([5, 10, 13, 100]);

function buildMatch(
  txFixture: TxFixture,
  lookup: MatchLookup,
  event: TxScoreEvent | null,
): FootballDataMatch {
  const statusId = event?.StatusId ?? txFixture.GameState ?? 1;
  const status = mapStatusIdToShort(statusId);

  // Orient TxLINE participants onto Mundial's home/away by name.
  const homeIsP1 = txFixtureHomeIsP1(txFixture, lookup);

  let score: MatchScores | undefined;
  if (event) {
    const p1 = goalsFor(event, 1);
    const p2 = goalsFor(event, 2);
    const home = homeIsP1 ? p1 : p2;
    const away = homeIsP1 ? p2 : p1;

    const goalsLine =
      home.total != null && away.total != null
        ? { home: home.total, away: away.total }
        : undefined;

    let fullTimeLine: { home: number; away: number } | undefined;
    if (TERMINAL_STATUS_IDS.has(statusId)) {
      if (home.regulation != null && away.regulation != null) {
        // Regulation (H1+H2) only — extra time and penalties never settle.
        fullTimeLine = { home: home.regulation, away: away.regulation };
      } else if (statusId === 5 && home.total != null && away.total != null) {
        // Plain full time with no extra time: total equals regulation.
        fullTimeLine = { home: home.total, away: away.total };
      }
    }

    score = { goals: goalsLine, fullTime: fullTimeLine };
  }

  const seconds = event?.Clock?.Seconds;
  const minute = typeof seconds === "number" ? Math.floor(seconds / 60) : null;

  return {
    id: txFixture.FixtureId,
    status,
    minute,
    homeTeam: { name: lookup.home },
    awayTeam: { name: lookup.away },
    score,
  };
}

function txFixtureHomeIsP1(txFixture: TxFixture, lookup: MatchLookup): boolean {
  // Orient using the same matcher that resolved the fixture.
  if (teamNamesMatch(txFixture.Participant1, lookup.home)) return true;
  if (teamNamesMatch(txFixture.Participant2, lookup.home)) return false;
  return txFixture.Participant1IsHome;
}

export function mapMatchRow(match: FootballDataMatch): LiveMatchData {
  let homeScore: number | null = null;
  let awayScore: number | null = null;

  if (isTerminalMatchStatus(match.status)) {
    const display = extractDisplayScores(match);
    homeScore = display.homeScore;
    awayScore = display.awayScore;
  } else {
    const live = extractLiveScores(match.score);
    homeScore = live.homeScore;
    awayScore = live.awayScore;
  }

  return {
    externalFixtureId: match.id,
    status: mapStatus(match.status),
    homeScore,
    awayScore,
    elapsed: match.minute ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fetch: resolve the TxLINE fixture by name/date, then read its latest score.
// ---------------------------------------------------------------------------

function kickoffMsOf(lookup: MatchLookup): number {
  return new Date(`${lookup.date}T${lookup.time}:00Z`).getTime();
}

export async function fetchApiMatch(
  lookup: MatchLookup,
  options?: { fresh?: boolean },
): Promise<FootballDataMatch | null> {
  const txFixture = await resolveTxFixture(
    lookup.home,
    lookup.away,
    kickoffMsOf(lookup),
  );
  if (!txFixture) return null;

  const id = txFixture.FixtureId;
  if (!options?.fresh) {
    const cached = getCachedFixture(id);
    if (cached !== undefined) return cached;
  }

  const events = await fetchScoresSnapshot(id);
  const match = buildMatch(txFixture, lookup, latestScoreEvent(events));

  const ttlMs = isTerminalMatchStatus(match.status)
    ? FIXTURE_CACHE_TTL_MS
    : FIXTURE_CACHE_LIVE_TTL_MS;
  setCachedFixture(id, match, ttlMs);

  return match;
}

export async function fetchLiveMatch(
  lookup: MatchLookup,
): Promise<LiveMatchData | null> {
  const match = await fetchApiMatch(lookup);
  if (!match) return null;
  return mapMatchRow(match);
}

/** A goal for the live UI, mapped onto the fixture's home/away sides. */
export type MatchGoal = {
  minute: number | null;
  side: "home" | "away";
  player: string | null;
  playerShort: string | null;
  ownGoal: boolean;
  penalty: boolean;
};

function stubTxFixture(fixtureId: number, lookup: MatchLookup, gameState?: number): TxFixture {
  return {
    Ts: 0,
    StartTime: kickoffMsOf(lookup),
    Competition: "World Cup",
    CompetitionId: 0,
    FixtureGroupId: 0,
    Participant1Id: 0,
    Participant1: lookup.home,
    Participant2Id: 0,
    Participant2: lookup.away,
    FixtureId: fixtureId,
    Participant1IsHome: true,
    GameState: gameState,
  };
}

async function fetchMatchWithGoalsForId(
  fixtureId: number,
  lookup: MatchLookup,
  txFixture?: TxFixture,
): Promise<{ match: FootballDataMatch | null; goals: MatchGoal[] }> {
  const events = await fetchScoresSnapshot(fixtureId);
  const latest = latestScoreEvent(events);
  const fx =
    txFixture ??
    stubTxFixture(fixtureId, lookup, latest?.StatusId ?? undefined);

  const match = buildMatch(fx, lookup, latest);
  const homeIsP1 = txFixtureHomeIsP1(fx, lookup);
  const goals: MatchGoal[] = matchGoalsFromEvents(events, homeIsP1, "display");
  const actionGoals = matchGoalsFromEvents(events, homeIsP1, "persist");
  await persistTxlineGoals(fixtureId, actionGoals);

  const ttlMs = isTerminalMatchStatus(match.status)
    ? FIXTURE_CACHE_TTL_MS
    : FIXTURE_CACHE_LIVE_TTL_MS;
  setCachedFixture(fixtureId, match, ttlMs);

  return { match, goals };
}

/**
 * Fetch the live match plus its goals (scorer + minute) in a single scores
 * lookup. Always reads fresh — intended for the live board.
 */
export async function fetchMatchWithGoals(
  lookup: MatchLookup,
): Promise<{ match: FootballDataMatch | null; goals: MatchGoal[] }> {
  if (lookup.id != null && lookup.id > 0) {
    return fetchMatchWithGoalsForId(lookup.id, lookup);
  }

  const txFixture = await resolveTxFixture(
    lookup.home,
    lookup.away,
    kickoffMsOf(lookup),
  );
  if (!txFixture) return { match: null, goals: [] };

  return fetchMatchWithGoalsForId(txFixture.FixtureId, lookup, txFixture);
}

export { ApiFootballBudgetError, getApiFootballQuota } from "./txMatchSettlementCache";

/** Resolve final score once the feed reports the match finished (FT/AET/PEN). */
export function resolveFinalScoreFromApiMatch(
  match: FootballDataMatch,
  kickoffMs: number,
  nowMs: number,
  minMinutesAfterKickoff: number,
): { homeScore: number; awayScore: number } | null {
  if (!isTerminalMatchStatus(match.status)) return null;

  const minutesSinceKickoff = (nowMs - kickoffMs) / 60_000;
  if (minutesSinceKickoff < minMinutesAfterKickoff) return null;

  const settled = extractSettlementScores(match.score);
  if (!settled) return null;

  return settled;
}

export function isFinishedStatus(status: string): boolean {
  return isTerminalMatchStatus(status) || status === "FINISHED";
}

/** TxLINE GameState values that mean the match is still in play. */
export function isGameStateInPlay(gameState?: number): boolean {
  switch (gameState) {
    case 2: // 1H
    case 3: // HT
    case 4: // 2H
    case 6: // Waiting for extra time
    case 7: // ET first half
    case 8: // ET halftime
    case 9: // ET second half
    case 11: // Penalties waiting
    case 12: // Penalties in progress
    case 14: // Interrupted / live
      return true;
    default:
      return false;
  }
}

export function isGameStateFinished(gameState?: number): boolean {
  return gameState === 5 || gameState === 10 || gameState === 13 || gameState === 100;
}

/** Minimal live row from fixtures-snapshot GameState when scores were not fetched. */
export function liveFromTxGameState(
  fixtureId: number,
  gameState?: number,
): LiveMatchData | null {
  if (gameState == null || isGameStateFinished(gameState)) return null;
  if (!isGameStateInPlay(gameState)) return null;
  const status = gameState === 3 || gameState === 8 ? "HT" : "LIVE";
  return {
    externalFixtureId: fixtureId,
    status,
    homeScore: null,
    awayScore: null,
    elapsed: null,
  };
}

/** True when the feed reports the match has kicked off or ended. */
export function isStartedOrFinishedStatus(status: string): boolean {
  return (
    isFinishedStatus(status) ||
    status === "LIVE" ||
    status === "HT" ||
    status === "1H" ||
    status === "2H" ||
    status === "ET" ||
    status === "P"
  );
}

export function hasFinalScore(data: LiveMatchData): boolean {
  return data.homeScore !== null && data.awayScore !== null;
}
