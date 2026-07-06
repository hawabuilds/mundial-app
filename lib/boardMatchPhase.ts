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
