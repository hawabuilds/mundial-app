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
} from "./txMatchSettlement";
import {
  boardMatchHasStarted,
  nextStartedKickoffAfterMs,
} from "@/lib/boardMatchPhase";
import {
  BOARD_MATCH_MAX_MIN,
  MATCH_ASSUMED_DURATION_MIN,
  type BoardFixture,
  type FixturePhase,
} from "./enrichFixtures";
import {
  resolveMatchGoalsForDisplay,
} from "@/lib/matchGoalsPersist";
import { boardVenueLine } from "@/app/mundial/lib/venues";
import { ensureMatchOddsLocked } from "@/lib/ensureMatchOdds";
import { isFriendlyCompetition } from "@/lib/matchStage";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import type { Match1x2Odds } from "@/lib/scoring";
import {
  hydratePinnedRowFromScores,
  pinnedFixtureIds,
  pinnedTxFixtureIdsInBoardWindow,
} from "./pinnedBoardFixtures";
import { WORLD_CUP_2026_FIXTURES } from "@/app/data/worldCup2026Fixtures";
import { fixtureDateTime } from "@/app/data/fixtures";
import { fetchFixturesSnapshot, isTxoddsConfigured, type TxFixture } from "./txodds";
import {
  getMatchProofSummariesForTxFixtures,
  type MatchProofSummary,
} from "@/app/lib/supabase";
import {
  fetchAndPersistMatchProof,
  readTerminalStatusId,
  refreshStoredProofSemantics,
} from "@/lib/matchProofFetch";
import { getMatchProof } from "@/app/lib/supabase";
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

const registryKickoffByTxId = new Map(
  WORLD_CUP_2026_FIXTURES.filter((f) => f.externalFixtureId != null).map((f) => [
    f.externalFixtureId!,
    fixtureDateTime(f).getTime(),
  ]),
);

function rowHasStarted(
  row: BoardRow,
  live: LiveMatchData | null | undefined,
): boolean {
  return boardMatchHasStarted(row.fx.GameState, live);
}

/** Score lookups for delayed-kickoff detection (pre-whistle). */
const BOARD_SCORE_FETCH_MAX = 12;

function lookupPriority(
  a: BoardRow,
  b: BoardRow,
  nowMs: number,
  pinnedIds: ReadonlySet<number>,
): number {
  const aPin = pinnedIds.has(a.fx.FixtureId) ? 1 : 0;
  const bPin = pinnedIds.has(b.fx.FixtureId) ? 1 : 0;
  if (bPin !== aPin) return bPin - aPin;
  const aPlay = isGameStateInPlay(a.fx.GameState) ? 1 : 0;
  const bPlay = isGameStateInPlay(b.fx.GameState) ? 1 : 0;
  if (bPlay !== aPlay) return bPlay - aPlay;
  return b.kickoffMs - a.kickoffMs;
}

function shouldFetchBoardLive(
  row: BoardRow,
  nowMs: number,
  pinnedIds: ReadonlySet<number>,
): boolean {
  if (pinnedIds.has(row.fx.FixtureId) && row.kickoffMs <= nowMs) {
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

/** Tournament pins and any started match always get a scores feed lookup. */
function mustAlwaysFetchBoardScores(
  row: BoardRow,
  nowMs: number,
  pinnedIds: ReadonlySet<number>,
): boolean {
  if (pinnedIds.has(row.fx.FixtureId) && row.kickoffMs <= nowMs) {
    return true;
  }
  if (isGameStateInPlay(row.fx.GameState) || isGameStateFinished(row.fx.GameState)) {
    return true;
  }
  return row.kickoffMs <= nowMs && shouldFetchBoardLive(row, nowMs, pinnedIds);
}

async function fetchBoardLiveRow(
  row: BoardRow,
  liveData: Map<number, { live: LiveMatchData | null; goals: MatchGoal[] }>,
): Promise<void> {
  try {
    const { match, goals: matchGoals } = await fetchMatchWithGoals(
      {
        id: row.fx.FixtureId,
        home: row.fixture.home,
        away: row.fixture.away,
        date: row.fixture.date,
        time: row.fixture.time,
      },
      row.fx,
    );
    liveData.set(row.fx.FixtureId, {
      live: match ? mapMatchRow(match) : null,
      goals: matchGoals,
    });
  } catch {
    liveData.set(row.fx.FixtureId, { live: null, goals: [] });
  }
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
  if (isGameStateFinished(row.fx.GameState)) return true;
  if (
    isGameStateInPlay(row.fx.GameState) &&
    nowMs - row.kickoffMs >= BOARD_MATCH_MAX_MIN * 60_000
  ) {
    return true;
  }
  if (isGameStateInPlay(row.fx.GameState)) return false;
  return nowMs - row.kickoffMs >= MATCH_ASSUMED_DURATION_MIN * 60_000;
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

  const pinnedIds = pinnedFixtureIds(nowMs, sorted);
  const kickoffByTxId = new Map(
    rows.map((row) => [row.fx.FixtureId, row.kickoffMs] as const),
  );
  // Hydrate only fixtures missing from the TxLINE snapshot (registry pins /
  // delayed coverage). Never overwrite snapshot Participant names — scores
  // without lineups fall back to "Home"/"Away" and wipe real team names.
  const hydrateJobs: Promise<void>[] = [];
  for (const fixtureId of pinnedTxFixtureIdsInBoardWindow(nowMs, sorted)
    .filter((fixtureId) => !kickoffByTxId.has(fixtureId))
    .sort((a, b) => {
      const ka = registryKickoffByTxId.get(a) ?? 0;
      const kb = registryKickoffByTxId.get(b) ?? 0;
      const aPast = ka <= nowMs ? 0 : 1;
      const bPast = kb <= nowMs ? 0 : 1;
      if (aPast !== bPast) return aPast - bPast;
      if (aPast === 0) return kb - ka;
      return ka - kb;
    })) {
    hydrateJobs.push(
      (async () => {
        const pinned = await hydratePinnedRowFromScores(fixtureId);
        if (!pinned) return;
        if (
          pinned.fixture.home === "Home" &&
          pinned.fixture.away === "Away"
        ) {
          return;
        }
        if (rows.some((row) => row.fx.FixtureId === fixtureId)) return;
        rows.push(pinned);
      })(),
    );
  }
  await Promise.all(hydrateJobs);

  rows.sort((a, b) => a.kickoffMs - b.kickoffMs);

  const visibleRows = filterBoardRows(rows, nowMs, pinnedIds);

  // Fetch live scores for in-progress matches first (in-play GameState wins budget).
  const liveData = new Map<
    number,
    { live: LiveMatchData | null; goals: MatchGoal[] }
  >();

  const mustFetchRows = visibleRows
    .filter((row) => mustAlwaysFetchBoardScores(row, nowMs, pinnedIds))
    .sort((a, b) => {
      const aPast = a.kickoffMs <= nowMs ? 1 : 0;
      const bPast = b.kickoffMs <= nowMs ? 1 : 0;
      if (bPast !== aPast) return bPast - aPast;
      return lookupPriority(a, b, nowMs, pinnedIds);
    });

  await Promise.all(mustFetchRows.map((row) => fetchBoardLiveRow(row, liveData)));

  let optionalLookups = 0;
  const optionalFetchRows = visibleRows
    .filter(
      (row) =>
        !liveData.has(row.fx.FixtureId) &&
        shouldFetchBoardLive(row, nowMs, pinnedIds),
    )
    .sort((a, b) => lookupPriority(a, b, nowMs, pinnedIds));

  for (const row of optionalFetchRows) {
    if (optionalLookups >= BOARD_SCORE_FETCH_MAX) break;
    optionalLookups += 1;
    await fetchBoardLiveRow(row, liveData);
  }

  const nextKickoffAfter = (finishedKickoffMs: number): number =>
    nextStartedKickoffAfterMs(finishedKickoffMs, visibleRows, (row) => ({
      gameState: row.fx.GameState,
      live: resolveLive(row, liveData.get(row.fx.FixtureId)),
    }));

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

  const recentForProof = capped.filter((row) => row.phase === "recent");
  await Promise.all(
    recentForProof.map(async (row) => {
      const fixture = {
        home: row.home,
        away: row.away,
        date: row.date,
        time: row.time,
        externalFixtureId: row.externalFixtureId ?? row.txFixtureId,
      };
      try {
        const existing = await getMatchProof(row.id).catch(() => null);
        if (!existing) {
          await fetchAndPersistMatchProof(row.id, fixture);
        } else if (!existing.showVerifiedBadge) {
          await refreshStoredProofSemantics(row.id, fixture, existing);
        }
      } catch (error) {
        console.warn(
          `[match-proof] Board hydrate failed for match ${row.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );

  const recentTxIds = recentForProof.map((row) => row.txFixtureId);
  let proofByTxId = new Map<number, MatchProofSummary>();
  try {
    proofByTxId = await getMatchProofSummariesForTxFixtures(recentTxIds);
  } catch (error) {
    console.warn(
      "[match-proof] Failed to load stored proofs for board:",
      error instanceof Error ? error.message : error,
    );
  }

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
