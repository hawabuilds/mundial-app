export type MatchScore = {
  homeScore: number;
  awayScore: number;
};

export type PredictionScore = MatchScore;

/** @deprecated Legacy constants — use {@link scorePredictionDetailed} tiers. */
export const POINTS_EXACT = 5;
/** @deprecated */
export const POINTS_OUTCOME = 3;
/** @deprecated */
export const POINTS_PARTICIPATION = 1;

export const BASE_EXACT = 10;
export const BASE_OUTCOME_GOAL_DIFF = 7;
export const BASE_OUTCOME = 5;
export const BASE_NEAR_MISS = 2;
export const BASE_PARTICIPATION = 1;
export const MAX_UPSET_MULTIPLIER = 3;

export type MatchOutcome = "home" | "away" | "draw";

export type Match1x2Odds = {
  homePct: number;
  drawPct: number;
  awayPct: number;
};

export type ScoreTier = "exact" | "outcome" | "near" | "participation";

export type ScoreBreakdown = {
  points: number;
  base: number;
  multiplier: number;
  tier: ScoreTier;
};

export function getMatchOutcome(score: MatchScore): MatchOutcome {
  if (score.homeScore > score.awayScore) return "home";
  if (score.awayScore > score.homeScore) return "away";
  return "draw";
}

function goalDiff(score: MatchScore): number {
  return score.homeScore - score.awayScore;
}

function isNearMiss(prediction: PredictionScore, actual: MatchScore): boolean {
  const homeOff = Math.abs(prediction.homeScore - actual.homeScore);
  const awayOff = Math.abs(prediction.awayScore - actual.awayScore);
  const oneTeamExact =
    prediction.homeScore === actual.homeScore ||
    prediction.awayScore === actual.awayScore;
  return oneTeamExact || (homeOff <= 1 && awayOff <= 1);
}

/** Accuracy base before the TxLINE upset multiplier is applied. */
export function accuracyBase(
  prediction: PredictionScore,
  actual: MatchScore,
): { base: number; tier: ScoreTier } {
  if (
    prediction.homeScore === actual.homeScore &&
    prediction.awayScore === actual.awayScore
  ) {
    return { base: BASE_EXACT, tier: "exact" };
  }

  const predOutcome = getMatchOutcome(prediction);
  const actualOutcome = getMatchOutcome(actual);

  if (predOutcome === actualOutcome) {
    if (goalDiff(prediction) === goalDiff(actual)) {
      return { base: BASE_OUTCOME_GOAL_DIFF, tier: "outcome" };
    }
    return { base: BASE_OUTCOME, tier: "outcome" };
  }

  if (isNearMiss(prediction, actual)) {
    return { base: BASE_NEAR_MISS, tier: "near" };
  }

  return { base: BASE_PARTICIPATION, tier: "participation" };
}

function impliedPctForOutcome(
  outcome: MatchOutcome,
  odds: Match1x2Odds,
): number {
  if (outcome === "home") return odds.homePct;
  if (outcome === "away") return odds.awayPct;
  return odds.drawPct;
}

/**
 * Upset bonus when the predicted outcome was unlikely per TxLINE pre-kickoff odds.
 * Only applies when the outcome (or exact) was correct — capped at ×3.
 */
export function upsetMultiplier(
  predictedOutcome: MatchOutcome,
  odds: Match1x2Odds,
): number {
  const pct = impliedPctForOutcome(predictedOutcome, odds);
  if (pct <= 0) return 1;
  return Math.min(MAX_UPSET_MULTIPLIER, 100 / pct);
}

export function scorePredictionDetailed(
  prediction: PredictionScore,
  actual: MatchScore,
  odds?: Match1x2Odds | null,
): ScoreBreakdown {
  const { base, tier } = accuracyBase(prediction, actual);

  if (tier === "participation" || tier === "near") {
    return { points: base, base, multiplier: 1, tier };
  }

  const multiplier =
    odds != null ? upsetMultiplier(getMatchOutcome(prediction), odds) : 1;
  const points = Math.max(1, Math.round(base * multiplier));

  return { points, base, multiplier, tier };
}

export function scorePrediction(
  prediction: PredictionScore,
  actual: MatchScore,
  odds?: Match1x2Odds | null,
): number {
  return scorePredictionDetailed(prediction, actual, odds).points;
}

export function scoreReason(
  prediction: PredictionScore,
  actual: MatchScore,
  odds?: Match1x2Odds | null,
): ScoreTier {
  return scorePredictionDetailed(prediction, actual, odds).tier;
}

/** Map tier to legacy leaderboard breakdown buckets. */
export function tierToBreakdownBucket(
  tier: ScoreTier,
): "exact" | "outcome" | "participation" {
  if (tier === "exact") return "exact";
  if (tier === "outcome") return "outcome";
  return "participation";
}
