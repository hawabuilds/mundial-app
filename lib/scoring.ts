export type MatchScore = {
  homeScore: number;
  awayScore: number;
};

export type PredictionScore = MatchScore;

/** Base points before the TxLINE market multiplier. */
export const BASE_EXACT = 5;
export const BASE_OUTCOME = 3;
export const BASE_PARTICIPATION = 1;

/** @deprecated Use BASE_* constants */
export const POINTS_EXACT = BASE_EXACT;
/** @deprecated Use BASE_* constants */
export const POINTS_OUTCOME = BASE_OUTCOME;
/** @deprecated Use BASE_* constants */
export const POINTS_PARTICIPATION = BASE_PARTICIPATION;

export const MAX_UPSET_MULTIPLIER = 3;

export type MatchOutcome = "home" | "away" | "draw";

export type Match1x2Odds = {
  homePct: number;
  drawPct: number;
  awayPct: number;
};

export type ScoreTier = "exact" | "outcome" | "participation";

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

/** Accuracy base before the TxLINE market multiplier is applied. */
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

  if (getMatchOutcome(prediction) === getMatchOutcome(actual)) {
    return { base: BASE_OUTCOME, tier: "outcome" };
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
 * Market multiplier when the predicted result matched TxLINE pre-kickoff odds.
 * Only applied on exact or correct outcome — capped at ×3.
 */
export function upsetMultiplier(
  predictedOutcome: MatchOutcome,
  odds: Match1x2Odds,
): number {
  const pct = impliedPctForOutcome(predictedOutcome, odds);
  if (pct <= 0) return 1;
  return Math.min(MAX_UPSET_MULTIPLIER, 100 / pct);
}

/** Compact label for market-line UI (×1, ×1.1, ×3). */
export function formatUpsetMultiplier(multiplier: number): string {
  if (multiplier >= MAX_UPSET_MULTIPLIER - 0.01) return "×3";
  if (multiplier <= 1.05) return "×1";
  const rounded = Math.round(multiplier * 10) / 10;
  const text = rounded.toFixed(1);
  return `×${text.endsWith(".0") ? text.slice(0, -2) : text}`;
}

/** Human-readable post-match formula for the Fixtures breakdown line. */
export function formatPointsBreakdown(breakdown: {
  base: number;
  multiplier: number;
  points: number;
}): string {
  const mult = formatUpsetMultiplier(breakdown.multiplier);
  return `Base ${breakdown.base} × Market ${mult} = ${breakdown.points} pts`;
}

export function scorePredictionDetailed(
  prediction: PredictionScore,
  actual: MatchScore,
  odds?: Match1x2Odds | null,
): ScoreBreakdown {
  const { base, tier } = accuracyBase(prediction, actual);

  if (tier === "participation") {
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
