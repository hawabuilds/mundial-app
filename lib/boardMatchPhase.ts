import type { LiveMatchData } from "@/lib/txMatchSettlement";
import {
  isFinishedStatus,
  isGameStateFinished,
  isGameStateInPlay,
  isStartedOrFinishedStatus,
} from "@/lib/txMatchSettlement";

/** True when TxLINE fixtures snapshot or scores feed says the match has kicked off. */
export function boardMatchHasStarted(
  gameState: number | undefined,
  live: LiveMatchData | null | undefined,
): boolean {
  if (isGameStateInPlay(gameState)) return true;
  if (isGameStateFinished(gameState)) return true;
  if (live?.status && isStartedOrFinishedStatus(live.status)) return true;
  return false;
}

/**
 * Kickoff time of the next fixture that has actually started — used to keep an
 * FT card visible until the following match kicks off, not merely when its
 * scheduled time arrives (delayed kickoffs).
 */
export function nextStartedKickoffAfterMs<T extends { kickoffMs: number }>(
  finishedKickoffMs: number,
  rows: T[],
  contextFor: (row: T) => {
    gameState?: number;
    live?: LiveMatchData | null;
  },
): number {
  const sorted = [...rows].sort((a, b) => a.kickoffMs - b.kickoffMs);
  for (const row of sorted) {
    if (row.kickoffMs <= finishedKickoffMs) continue;
    const { gameState, live } = contextFor(row);
    if (boardMatchHasStarted(gameState, live)) {
      return row.kickoffMs;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** True when the match is in play (not FT). */
export function boardMatchIsLive(
  gameState: number | undefined,
  live: LiveMatchData | null | undefined,
): boolean {
  if (live?.status && isFinishedStatus(live.status)) return false;
  if (isGameStateFinished(gameState)) return false;
  if (isGameStateInPlay(gameState)) return true;
  if (!live?.status) return false;
  return isStartedOrFinishedStatus(live.status) && !isFinishedStatus(live.status);
}
