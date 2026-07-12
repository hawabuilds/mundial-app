import { MAX_KICKOFF_DELAY_HOURS } from "@/lib/effectiveKickoff";
import { BOARD_MATCH_MAX_MIN } from "@/lib/enrichFixtures";
import {
  isGameStateFinished,
  isGameStateInPlay,
} from "@/lib/txMatchSettlement";
import type { FixturePhase } from "@/lib/enrichFixtures";

/** Upcoming fixtures more than this far in the future are hidden. */
export const BOARD_UPCOMING_LOOKAHEAD_HOURS = 96;

/** Drop finished cards this long after kickoff. */
export const BOARD_RECENT_MAX_AGE_HOURS = 8;

/** Max upcoming rows after filtering (next games only). */
export const BOARD_MAX_UPCOMING = 10;

/** Max full-time cards on the board at once. */
export const BOARD_MAX_RECENT = 1;

const RECENT_MAX_AGE_MS = BOARD_RECENT_MAX_AGE_HOURS * 3_600_000;

type BoardRowLike = {
  kickoffMs: number;
  fx: { GameState?: number; FixtureId: number };
};

/** Board pin window: upcoming within lookahead, or recently finished. */
export function isPinnedBoardKickoffWindow(
  kickoffMs: number,
  nowMs: number,
): boolean {
  const lookaheadMs = BOARD_UPCOMING_LOOKAHEAD_HOURS * 3_600_000;
  if (kickoffMs > nowMs) {
    return kickoffMs - nowMs <= lookaheadMs;
  }
  return nowMs - kickoffMs <= RECENT_MAX_AGE_MS;
}

export function shouldIncludeRowOnBoard(
  row: BoardRowLike,
  nowMs: number,
  pinnedFixtureIds?: ReadonlySet<number>,
): boolean {
  const { kickoffMs, fx } = row;

  if (
    pinnedFixtureIds?.has(fx.FixtureId) &&
    isPinnedBoardKickoffWindow(kickoffMs, nowMs)
  ) {
    return true;
  }

  const gameState = fx.GameState;

  if (isGameStateInPlay(gameState)) {
    // Stale snapshot GameState (e.g. stuck HT) long after kickoff — drop from board.
    if (
      kickoffMs <= nowMs &&
      nowMs - kickoffMs > BOARD_MATCH_MAX_MIN * 60_000
    ) {
      return false;
    }
    return true;
  }

  if (isGameStateFinished(gameState)) {
    return nowMs - kickoffMs <= RECENT_MAX_AGE_MS;
  }

  const lookaheadMs = BOARD_UPCOMING_LOOKAHEAD_HOURS * 3_600_000;
  const staleMs = MAX_KICKOFF_DELAY_HOURS * 3_600_000;

  if (kickoffMs > nowMs) {
    return kickoffMs - nowMs <= lookaheadMs;
  }

  // Scheduled time passed but TxLINE has not started — delayed kickoff window only.
  return nowMs - kickoffMs <= staleMs;
}

export type BoardEntryLike = {
  phase: FixturePhase;
  kickoffUtcMs: number;
  txFixtureId: number;
};

/**
 * Keep the board focused: live matches, one FT result, and the next few fixtures.
 * Prevents stale pinned / snapshot rows from cluttering the Fixtures tab.
 */
export function capBoardForDisplay<T extends BoardEntryLike>(
  board: T[],
): T[] {
  const live = board.filter((row) => row.phase === "live");
  const recent = board
    .filter((row) => row.phase === "recent")
    .sort((a, b) => b.kickoffUtcMs - a.kickoffUtcMs)
    .slice(0, BOARD_MAX_RECENT);
  const upcoming = board
    .filter((row) => row.phase === "upcoming")
    .sort((a, b) => a.kickoffUtcMs - b.kickoffUtcMs)
    .slice(0, BOARD_MAX_UPCOMING);

  const phaseRank: Record<FixturePhase, number> = {
    live: 0,
    recent: 1,
    upcoming: 2,
  };

  return [...live, ...recent, ...upcoming].sort((a, b) => {
    const byPhase = phaseRank[a.phase] - phaseRank[b.phase];
    if (byPhase !== 0) return byPhase;
    if (a.phase === "upcoming") return a.kickoffUtcMs - b.kickoffUtcMs;
    return b.kickoffUtcMs - a.kickoffUtcMs;
  });
}

/** @internal test helper — drop rows before building the board. */
export function filterBoardRows<T extends BoardRowLike>(
  rows: T[],
  nowMs: number,
  pinnedFixtureIds?: ReadonlySet<number>,
): T[] {
  return rows.filter((row) =>
    shouldIncludeRowOnBoard(row, nowMs, pinnedFixtureIds),
  );
}
