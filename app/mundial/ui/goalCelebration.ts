import type { CSSProperties } from "react";

export type GoalCelebration = {
  key: number;
  matchId: number;
  side: "home" | "away";
  player: string | null;
  ownGoal: boolean;
  minute: number | null;
  /** In-play penalty kick (not shootout). */
  penalty: boolean;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeScore: number;
  awayScore: number;
  /** Score shown on the card until the overlay finishes. */
  prevHomeScore: number;
  prevAwayScore: number;
};

/** Full centre overlay — ball rush, GOAL hold, fade. */
export const GOAL_MOMENT_MS = 3600;
export const GOAL_CARD_MOMENT_MS = GOAL_MOMENT_MS;

/** When ball hits — card glow peak. */
export const GOAL_IMPACT_MS = Math.round(GOAL_MOMENT_MS * 0.33);

/** Score + scorer flip together on the card — end of GOAL hold. */
export const GOAL_SCORE_REVEAL_MS = Math.round(GOAL_MOMENT_MS * 0.76);

/** Extra wait if score arrives before player/minute (common for penalties). */
export const GOAL_SCORER_WAIT_MS = 2500;

/** @deprecated use GOAL_SCORE_REVEAL_MS */
export const GOAL_SCORER_REVEAL_MS = GOAL_SCORE_REVEAL_MS;

/** Shared CSS timing vars for overlay + featured card. */
export function goalCelebrationTimingStyle(): CSSProperties {
  return {
    ["--goal-moment" as string]: `${GOAL_MOMENT_MS}ms`,
    ["--goal-impact" as string]: `${GOAL_IMPACT_MS}ms`,
    ["--goal-scorer" as string]: `${GOAL_SCORE_REVEAL_MS}ms`,
    ["--goal-score-reveal" as string]: `${GOAL_SCORE_REVEAL_MS}ms`,
  };
}

export function goalCelebrationLabel(event: GoalCelebration): string {
  if (event.ownGoal) return "Own goal";
  if (event.player) return event.player;
  return "Goal";
}

export function goalCelebrationCaption(event: GoalCelebration): string {
  const name = goalCelebrationLabel(event);
  return event.minute != null ? `${event.minute}' · ${name}` : name;
}
