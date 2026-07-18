import type { FirstGoalscorerPredictionRow } from "@/app/lib/firstGoalscorerPredictions";
import type { StoredGoal } from "@/app/lib/supabase";
import { SCORER_BACKFILL_MAX_AGE_MS } from "@/lib/backfillMatchGoals";
import {
  assessGoalDataCompleteness,
  type GoalDataCompletenessAssessment,
} from "@/lib/firstGoalscorerCompleteness";
import type { FirstGoalscorer } from "@/lib/firstGoalscorer";

export const FIRST_GOALSCORER_BONUS_MULTIPLIER = 2;

export type FirstGoalscorerBonusOutcome = "void" | "no_bonus" | "doubled";

export type FirstGoalscorerBonusDecision = {
  outcome: FirstGoalscorerBonusOutcome;
  /** Extra points added on top of scoreline points (0 when void / wrong / 0-0). */
  bonusPoints: number;
  /** Final predictions.points after settlement. */
  finalPoints: number;
};

export type FirstGoalscorerSettlementPlan = {
  action: "wait" | "settle";
  assessment: GoalDataCompletenessAssessment;
  decisions: Map<string, FirstGoalscorerBonusDecision>;
};

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match pick to market first scorer — PlayerId when both present, else normalized name + side. */
export function isFirstGoalscorerPredictionCorrect(
  pick: Pick<
    FirstGoalscorerPredictionRow,
    "player_id" | "player_name" | "player_side"
  >,
  marketFirst: FirstGoalscorer,
): boolean {
  if (pick.player_side !== marketFirst.side) return false;

  if (pick.player_id != null && marketFirst.playerId != null) {
    return pick.player_id === marketFirst.playerId;
  }

  const pickName = normalizePlayerName(pick.player_name);
  const marketName = normalizePlayerName(marketFirst.player ?? "");
  return pickName.length > 0 && pickName === marketName;
}

export function scorelinePointsFromPrediction(row: {
  points: number | null;
  score_base?: number | null;
  score_multiplier?: number | null;
}): number | null {
  if (row.points == null) return null;
  if (row.score_base != null && row.score_multiplier != null) {
    return Math.max(1, Math.round(row.score_base * row.score_multiplier));
  }
  return row.points;
}

export function decideFirstGoalscorerBonus(
  pick: FirstGoalscorerPredictionRow,
  assessment: GoalDataCompletenessAssessment,
  scorelinePoints: number | null,
): FirstGoalscorerBonusDecision {
  const basePoints = scorelinePoints ?? 0;

  if (!assessment.settleableForFirstScorer) {
    return {
      outcome: "void",
      bonusPoints: 0,
      finalPoints: basePoints,
    };
  }

  if (assessment.expectedTotal === 0) {
    return {
      outcome: "no_bonus",
      bonusPoints: 0,
      finalPoints: basePoints,
    };
  }

  const marketFirst = assessment.firstGoalscorer;
  if (!marketFirst) {
    return {
      outcome: "no_bonus",
      bonusPoints: 0,
      finalPoints: basePoints,
    };
  }

  if (isFirstGoalscorerPredictionCorrect(pick, marketFirst)) {
    const bonusPoints = basePoints;
    return {
      outcome: "doubled",
      bonusPoints,
      finalPoints: basePoints * FIRST_GOALSCORER_BONUS_MULTIPLIER,
    };
  }

  return {
    outcome: "no_bonus",
    bonusPoints: 0,
    finalPoints: basePoints,
  };
}

/**
 * Wait for goal backfill while data is incomplete and still inside the retry window.
 * Otherwise settle (apply bonus, no bonus, or void).
 */
export function shouldWaitForFirstGoalscorerSettlement(
  assessment: GoalDataCompletenessAssessment,
  scoredAtMs: number | null,
  nowMs = Date.now(),
): boolean {
  if (assessment.settleableForFirstScorer) return false;
  if (assessment.status === "complete") return false;
  if (scoredAtMs == null || !Number.isFinite(scoredAtMs)) return false;
  return nowMs - scoredAtMs <= SCORER_BACKFILL_MAX_AGE_MS;
}

export function planFirstGoalscorerSettlement(input: {
  goals: StoredGoal[];
  homeScore: number;
  awayScore: number;
  picks: FirstGoalscorerPredictionRow[];
  predictionsByUserId: Map<
    string,
    {
      points: number | null;
      score_base?: number | null;
      score_multiplier?: number | null;
    }
  >;
  scoredAtMs: number | null;
  nowMs?: number;
}): FirstGoalscorerSettlementPlan {
  const assessment = assessGoalDataCompleteness(
    input.goals,
    input.homeScore,
    input.awayScore,
  );

  if (
    shouldWaitForFirstGoalscorerSettlement(
      assessment,
      input.scoredAtMs,
      input.nowMs,
    )
  ) {
    return { action: "wait", assessment, decisions: new Map() };
  }

  const decisions = new Map<string, FirstGoalscorerBonusDecision>();
  for (const pick of input.picks) {
    const prediction = input.predictionsByUserId.get(pick.user_id) ?? null;
    const scorelinePoints = prediction
      ? scorelinePointsFromPrediction(prediction)
      : null;
    decisions.set(
      pick.user_id,
      decideFirstGoalscorerBonus(pick, assessment, scorelinePoints),
    );
  }

  return { action: "settle", assessment, decisions };
}

export type FirstGoalscorerSettlementSummary = {
  matchId: number;
  status:
    | "skipped"
    | "waiting"
    | "already_settled"
    | "settled"
    | "settled_void"
    | "error";
  reason?: string;
  assessment?: GoalDataCompletenessAssessment;
  picksProcessed: number;
  doubled: number;
  noBonus: number;
  voided: number;
};
