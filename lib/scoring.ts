export type MatchScore = {
  homeScore: number;
  awayScore: number;
};

export type PredictionScore = MatchScore;

export const POINTS_EXACT = 5;
export const POINTS_OUTCOME = 3;
export const POINTS_PARTICIPATION = 1;

export type MatchOutcome = "home" | "away" | "draw";

export function getMatchOutcome(score: MatchScore): MatchOutcome {
  if (score.homeScore > score.awayScore) return "home";
  if (score.awayScore > score.homeScore) return "away";
  return "draw";
}

/**
 * Award points for a single prediction vs the final score.
 * - 5: exact scoreline
 * - 3: correct outcome (win/draw) but not exact
 * - 1: wrong outcome (participation)
 */
export function scorePrediction(
  prediction: PredictionScore,
  actual: MatchScore,
): number {
  if (
    prediction.homeScore === actual.homeScore &&
    prediction.awayScore === actual.awayScore
  ) {
    return POINTS_EXACT;
  }

  if (getMatchOutcome(prediction) === getMatchOutcome(actual)) {
    return POINTS_OUTCOME;
  }

  return POINTS_PARTICIPATION;
}

export function scoreReason(
  prediction: PredictionScore,
  actual: MatchScore,
): "exact" | "outcome" | "participation" {
  const points = scorePrediction(prediction, actual);
  if (points === POINTS_EXACT) return "exact";
  if (points === POINTS_OUTCOME) return "outcome";
  return "participation";
}
