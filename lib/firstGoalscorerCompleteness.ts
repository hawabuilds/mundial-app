import type { StoredGoal } from "@/app/lib/supabase";
import { countGoalsBySide } from "@/lib/backfillMatchGoals";
import {
  deriveMarketFirstGoalscorer,
  isPlayByPlayGoal,
  type FirstGoalscorer,
} from "@/lib/firstGoalscorer";

export type GoalDataCompletenessStatus = "complete" | "incomplete";

export type GoalDataCompletenessAssessment = {
  status: GoalDataCompletenessStatus;
  /** When false, first-scorer bonus voids — users keep base scoreline points. */
  settleableForFirstScorer: boolean;
  firstGoalscorer: FirstGoalscorer | null;
  reasons: string[];
  homeGoals: number;
  awayGoals: number;
  namedGoals: number;
  expectedTotal: number;
  playByPlayGoals: number;
};

function hasNamedPlayer(goal: StoredGoal): boolean {
  return Boolean(goal.player?.trim());
}

/**
 * Whether stored goal rows are complete enough to settle a first-scorer market.
 * Requires named goals matching FT per side, plus play-by-play clock on every goal.
 */
export function assessGoalDataCompleteness(
  goals: StoredGoal[],
  homeScore: number,
  awayScore: number,
): GoalDataCompletenessAssessment {
  const counts = countGoalsBySide(goals);
  const expectedTotal = homeScore + awayScore;
  const namedGoals = goals.filter(hasNamedPlayer).length;
  const playByPlayGoals = goals.filter(isPlayByPlayGoal).length;
  const reasons: string[] = [];

  if (counts.home !== homeScore) {
    reasons.push(`home goal rows ${counts.home} != FT ${homeScore}`);
  }
  if (counts.away !== awayScore) {
    reasons.push(`away goal rows ${counts.away} != FT ${awayScore}`);
  }
  if (goals.length !== expectedTotal) {
    reasons.push(`stored goals ${goals.length} != FT total ${expectedTotal}`);
  }
  if (namedGoals !== expectedTotal) {
    reasons.push(`named goals ${namedGoals} != FT total ${expectedTotal}`);
  }

  const unnamed = goals.filter((goal) => !hasNamedPlayer(goal));
  if (unnamed.length > 0) {
    reasons.push(`${unnamed.length} goal(s) missing scorer name`);
  }

  if (expectedTotal > 0) {
    const missingClock = goals.filter((goal) => goal.clockSeconds == null);
    if (missingClock.length > 0) {
      reasons.push(`${missingClock.length} goal(s) missing clock_seconds`);
    }
    const missingSeq = goals.filter((goal) => goal.seq == null);
    if (missingSeq.length > 0) {
      reasons.push(`${missingSeq.length} goal(s) missing seq`);
    }
    if (playByPlayGoals !== expectedTotal) {
      reasons.push(
        `play-by-play goals ${playByPlayGoals} != FT total ${expectedTotal}`,
      );
    }
  }

  const complete = reasons.length === 0;
  let firstGoalscorer: FirstGoalscorer | null = null;
  let settleableForFirstScorer = false;

  if (complete) {
    if (expectedTotal === 0) {
      settleableForFirstScorer = true;
    } else {
      firstGoalscorer = deriveMarketFirstGoalscorer(goals);
      settleableForFirstScorer = firstGoalscorer != null;
      if (!settleableForFirstScorer) {
        reasons.push(
          "no proper first goalscorer (all goals own goals or unresolvable)",
        );
      }
    }
  }

  return {
    status: complete ? "complete" : "incomplete",
    settleableForFirstScorer,
    firstGoalscorer,
    reasons,
    homeGoals: counts.home,
    awayGoals: counts.away,
    namedGoals,
    expectedTotal,
    playByPlayGoals,
  };
}

/** True when a TxLINE historical backfill may improve first-scorer readiness. */
export function needsGoalDataBackfill(
  goals: StoredGoal[],
  homeScore: number,
  awayScore: number,
): boolean {
  return !assessGoalDataCompleteness(goals, homeScore, awayScore)
    .settleableForFirstScorer;
}

export function isGoalDataComplete(
  goals: StoredGoal[],
  homeScore: number,
  awayScore: number,
): boolean {
  return assessGoalDataCompleteness(goals, homeScore, awayScore).status ===
    "complete";
}
