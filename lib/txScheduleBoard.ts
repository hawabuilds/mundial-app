// Live match board sourced directly from the TxLINE schedule (not the static
// fixtures list). Shows whatever TxLINE currently covers — upcoming, in-play,
// and just-finished matches — so the Fixtures tab always reflects real games.

import type { Fixture } from "@/app/data/fixtures";
import { findFixtureByTeamsAndKickoff } from "@/app/data/fixtures";
import {
  fetchMatchWithGoals,
  isFinishedStatus,
  isGameStateFinished,
  isGameStateInPlay,
  isStartedOrFinishedStatus,
  liveFromTxGameState,
  mapMatchRow,
  type LiveMatchData,
  type MatchGoal,
} from "./apiFootball";
import { boardMatchHasStarted } from "@/lib/boardMatchPhase";
import {
  BOARD_MATCH_MAX_MIN,
  type BoardFixture,
  type FixturePhase,
} from "./enrichFixtures";
import {
  persistTxlineGoals,
  resolveMatchGoalsForDisplay,
} from "@/lib/matchGoalsPersist";
import { boardVenueLine } from "@/app/mundial/lib/venues";
import { ensureMatchOddsLocked } from "@/lib/ensureMatchOdds";
import { isFriendlyCompetition } from "@/lib/matchStage";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import type { Match1x2Odds } from "@/lib/scoring";
import {
  PINNED_FIXTURE_IDS,
  hydratePinnedRowFromScores,
  pinnedFixtureIds,
} from "./pinnedBoardFixtures";
import { fetchFixturesSnapshot, isTxoddsConfigured, type TxFixture } from "./txodds";
import {
  getMatchProofSummariesForTxFixtures,
  type MatchProofSummary,
} from "@/app/lib/supabase";
import { readTerminalStatusId } from "@/lib/matchProofFetch";
import {
  capBoardForDisplay,
  filterBoardRows,
} from "@/lib/boardDisplayPolicy";

/** Board fixture carrying venue/competition line, live goals, and locked 1X2 odds. */
export type ScheduleBoardFixture = BoardFixture & {
  venueLine: string;
  goals: MatchGoal[];
  marketOdds: Match1x2Odds | null;
  fixtureGroupId?: number;
  kickoffUtcMs: number;
  /** TxLINE FixtureId — always use for score/proof lookups, not {@link Fixture.id}. */
  txFixtureId: number;
  /** Stored TxLINE stat-validation proof when settlement proof was fetched. */
  txlineProof?: MatchProofSummary | null;
  terminalStatusId?: number | null;
};

/** Only look up live scores for matches that kicked off within this window. */
const LIVE_LOOKUP_MAX_HOURS_AFTER_KICKOFF = 4;

function txStartToDateTime(startMs: number): {
  date: string;
  time: string;
  kickoffUtcMs: number;
} {
  const kickoffUtcMs = normalizeStartTimeMs(startMs);
  const iso = new Date(kickoffUtcMs).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), kickoffUtcMs };
}

/**
 * Merge live-accumulated goals with the current TxLINE snapshot for display.
 */
async function goalsFromTxline(
  fixtureId: number,
  freshGoals: MatchGoal[],
  homeScore: number | null,
  awayScore: number | null,
): Promise<MatchGoal[]> {
  return resolveMatchGoalsForDisplay({
    fixtureId,
    freshGoals,
    homeScore,
    awayScore,
  });
}

function txToFixture(fx: TxFixture): Fixture | null {
  const competition = fx.Competition ?? "";
  if (isFriendlyCompetition(competition)) return null;

  const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
  const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
  const { date, time, kickoffUtcMs } = txStartToDateTime(fx.StartTime);
  const registry = findFixtureByTeamsAndKickoff(home, away, kickoffUtcMs);
  return {
    id: registry?.id ?? fx.FixtureId,
    home,
    away,
    date,
    time,
    group: registry?.group ?? competition,
    externalFixtureId: registry?.externalFixtureId ?? fx.FixtureId,
  };
}

type BoardRow = {
  fx: TxFixture;
  fixture: Fixture;
  kickoffMs: number;
  kickoffUtcMs: number;
};

/** Score lookups for every visible match in the kickoff window (live detection). */
const BOARD_SCORE_FETCH_MAX = 12;

function rowHasStarted(
  row: BoardRow,
  live: LiveMatchData | null | undefined,
): boolean {
  return boardMatchHasStarted(row.fx.GameState, live);
}

function lookupPriority(a: BoardRow, b: BoardRow): number {
  const pinned = pinnedFixtureIds();
  const aPin = pinned.has(a.fx.FixtureId) ? 1 : 0;
  const bPin = pinned.has(b.fx.FixtureId) ? 1 : 0;
  if (bPin !== aPin) return bPin - aPin;
  const aPlay = isGameStateInPlay(a.fx.GameState) ? 1 : 0;
  const bPlay = isGameStateInPlay(b.fx.GameState) ? 1 : 0;
  if (bPlay !== aPlay) return bPlay - aPlay;
  return b.kickoffMs - a.kickoffMs;
}

function shouldFetchBoardLive(row: BoardRow, nowMs: number): boolean {
  if (pinnedFixtureIds().has(row.fx.FixtureId) && row.kickoffMs <= nowMs) {
    return true;
  }
  if (isGameStateInPlay(row.fx.GameState)) return true;
  if (isGameStateFinished(row.fx.GameState) && row.kickoffMs <= nowMs) {
    return true;
  }
  if (row.kickoffMs > nowMs) return false;
  if (
    (nowMs - row.kickoffMs) / 3_600_000 >
    LIVE_LOOKUP_MAX_HOURS_AFTER_KICKOFF
  ) {
    return false;
  }
  return nowMs - row.kickoffMs < BOARD_MATCH_MAX_MIN * 60_000;
}

function isBoardMatchFinished(
  row: BoardRow,
  live: LiveMatchData | null,
  nowMs: number,
): boolean {
  if (!rowHasStarted(row, live)) return false;
  if (live?.status && isFinishedStatus(live.status)) return true;
  if (
    live?.status &&
    isStartedOrFinishedStatus(live.status) &&
    !isFinishedStatus(live.status)
  ) {
    return false;
  }
  if (isGameStateInPlay(row.fx.GameState)) return false;
  if (isGameStateFinished(row.fx.GameState)) return true;
  return nowMs - row.kickoffMs >= BOARD_MATCH_MAX_MIN * 60_000;
}

function resolveLive(
  row: BoardRow,
  fetched: { live: LiveMatchData | null; goals: MatchGoal[] } | undefined,
): LiveMatchData | null {
  if (fetched?.live) return fetched.live;
  return liveFromTxGameState(row.fx.FixtureId, row.fx.GameState);
}

export async function getTxScheduleBoard(
  now: Date = new Date(),
): Promise<ScheduleBoardFixture[]> {
  if (!isTxoddsConfigured()) return [];

  const txFixtures = await fetchFixturesSnapshot();
  const sorted = [...txFixtures].sort(
    (a, b) => normalizeStartTimeMs(a.StartTime) - normalizeStartTimeMs(b.StartTime),
  );

  const nowMs = now.getTime();
  const rows: BoardRow[] = [];
  for (const fx of sorted) {
    const fixture = txToFixture(fx);
    if (!fixture) continue;
    const kickoffUtcMs = normalizeStartTimeMs(fx.StartTime);
    rows.push({ fx, fixture, kickoffMs: kickoffUtcMs, kickoffUtcMs });
  }

  for (const fixtureId of PINNED_FIXTURE_IDS) {
    if (rows.some((row) => row.fx.FixtureId === fixtureId)) continue;
    const pinned = await hydratePinnedRowFromScores(fixtureId);
    if (pinned) rows.push(pinned);
  }

  rows.sort((a, b) => a.kickoffMs - b.kickoffMs);

  const visibleRows = filterBoardRows(rows, nowMs);

  const kickoffs = visibleRows.map((row) => row.kickoffMs).sort((a, b) => a - b);
  const nextKickoffAfter = (ms: number): number => {
    for (const k of kickoffs) if (k > ms) return k;
    return Number.POSITIVE_INFINITY;
  };

  // Fetch live scores for in-progress matches first (in-play GameState wins budget).
  const liveData = new Map<
    number,
    { live: LiveMatchData | null; goals: MatchGoal[] }
  >();
  let liveLookups = 0;
  // Prefer kickoff-passed rows so scores feed can flip them to live promptly.
  const lookupCandidates = visibleRows
    .filter((row) => shouldFetchBoardLive(row, nowMs))
    .sort((a, b) => {
      const aPast = a.kickoffMs <= nowMs ? 1 : 0;
      const bPast = b.kickoffMs <= nowMs ? 1 : 0;
      if (bPast !== aPast) return bPast - aPast;
      return lookupPriority(a, b);
    });

  for (const row of lookupCandidates) {
    if (liveLookups >= BOARD_SCORE_FETCH_MAX) break;
    liveLookups += 1;
    try {
      const { match, goals: matchGoals } = await fetchMatchWithGoals({
        id: row.fx.FixtureId,
        home: row.fixture.home,
        away: row.fixture.away,
        date: row.fixture.date,
        time: row.fixture.time,
      });
      liveData.set(row.fx.FixtureId, {
        live: match ? mapMatchRow(match) : null,
        goals: matchGoals,
      });
    } catch {
      liveData.set(row.fx.FixtureId, { live: null, goals: [] });
    }
  }

  const board: ScheduleBoardFixture[] = [];
  const oddsByFixtureId = new Map<number, Match1x2Odds | null>();

  const upcomingByKickoff = visibleRows
    .filter((row) => {
      const fetched = liveData.get(row.fx.FixtureId);
      const live = resolveLive(row, fetched);
      return !rowHasStarted(row, live);
    })
    .sort((a, b) => a.kickoffMs - b.kickoffMs);

  // Lock/load pre-kickoff 1X2 for every match visible on the board (live, recent FT,
  // and next upcoming) so the market line persists on FT cards until the next whistle.
  const oddsTargetIds = new Set<number>();
  for (const row of visibleRows) {
    const fetched = liveData.get(row.fx.FixtureId);
    const live = resolveLive(row, fetched);
    if (!rowHasStarted(row, live)) continue;
    const finished = isBoardMatchFinished(row, live, nowMs);
    if (!finished || nowMs < nextKickoffAfter(row.kickoffMs)) {
      oddsTargetIds.add(row.fx.FixtureId);
    }
  }
  if (upcomingByKickoff[0]) {
    oddsTargetIds.add(upcomingByKickoff[0].fx.FixtureId);
  }

  for (const fixtureId of oddsTargetIds) {
    const row = visibleRows.find((r) => r.fx.FixtureId === fixtureId);
    if (!row) continue;
    oddsByFixtureId.set(
      fixtureId,
      await ensureMatchOddsLocked(
        row.fixture.id,
        {
          home: row.fixture.home,
          away: row.fixture.away,
          kickoffMs: row.kickoffMs,
        },
        row.fx.FixtureId,
      ).catch(() => null),
    );
  }

  for (const row of visibleRows) {
    const { fx, fixture, kickoffMs, kickoffUtcMs } = row;
    const venueLine = boardVenueLine(
      fixture.home,
      fixture.away,
      fixture.date,
      fx.Competition,
    );
    const marketOdds = oddsByFixtureId.get(fx.FixtureId) ?? null;
    const base = {
      ...fixture,
      apiConfigured: true,
      fixtureGroupId: fx.FixtureGroupId,
      txFixtureId: fx.FixtureId,
      venueLine,
      goals: [] as MatchGoal[],
      marketOdds,
      kickoffUtcMs,
    };

    const fetched = liveData.get(fx.FixtureId);
    const live: LiveMatchData | null = resolveLive(row, fetched);

    if (!rowHasStarted(row, live)) {
      board.push({ ...base, live: null, phase: "upcoming" });
      continue;
    }

    let goals: MatchGoal[] = fetched?.goals ?? [];

    const finished = isBoardMatchFinished(row, live, nowMs);

    const displayLive: LiveMatchData | null =
      finished && live && !isFinishedStatus(live.status)
        ? { ...live, status: "FT", elapsed: null }
        : live;

    const mergedGoals = await goalsFromTxline(
      fx.FixtureId,
      goals,
      displayLive?.homeScore ?? live?.homeScore ?? null,
      displayLive?.awayScore ?? live?.awayScore ?? null,
    );

    if (!finished) {
      board.push({ ...base, live: displayLive, goals: mergedGoals, phase: "live" });
      continue;
    }

    if (nowMs < nextKickoffAfter(kickoffMs)) {
      board.push({ ...base, live: displayLive, goals: mergedGoals, phase: "recent" });
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
    // Upcoming: soonest kickoff first. Live/recent: most recent first.
    if (a.phase === "upcoming") return a.kickoffUtcMs - b.kickoffUtcMs;
    return b.kickoffUtcMs - a.kickoffUtcMs;
  });

  const capped = capBoardForDisplay(board);

  const recentTxIds = capped
    .filter((row) => row.phase === "recent")
    .map((row) => row.txFixtureId);
  const proofByTxId = await getMatchProofSummariesForTxFixtures(recentTxIds).catch(
    () => new Map<number, MatchProofSummary>(),
  );

  const recentRows = capped.filter((row) => row.phase === "recent");
  const terminalByTxId = new Map<number, number | null>();
  await Promise.all(
    recentRows.map(async (row) => {
      terminalByTxId.set(
        row.txFixtureId,
        await readTerminalStatusId(row.txFixtureId),
      );
    }),
  );

  return capped.map((row) => ({
    ...row,
    txlineProof:
      row.phase === "recent"
        ? (proofByTxId.get(row.txFixtureId) ?? null)
        : null,
    terminalStatusId:
      row.phase === "recent"
        ? (terminalByTxId.get(row.txFixtureId) ?? null)
        : null,
  }));
}
