export type ScoreLine = { home: number | null; away: number | null };

/** Match score object from API-Football normalization. */
export type MatchScores = {
  /** 90 minutes + stoppage time (betting-style "regular time"). */
  fullTime?: ScoreLine;
  extraTime?: ScoreLine;
  /** Penalty shootout tally — never used for prediction settlement. */
  penalty?: ScoreLine;
  /** Live goals (may include ET goals during extra time). */
  goals?: ScoreLine;
};

function lineValid(line: ScoreLine | undefined): line is { home: number; away: number } {
  return line?.home != null && line?.away != null;
}

/**
 * Score used to settle predictions: 90 minutes + injury time only.
 * Extra time and penalty shootouts never count (same as most betting markets).
 */
export function extractSettlementScores(
  scores: MatchScores | undefined,
): { homeScore: number; awayScore: number } | null {
  if (!scores) return null;

  if (lineValid(scores.fullTime)) {
    return { homeScore: scores.fullTime.home, awayScore: scores.fullTime.away };
  }

  return null;
}

/** Live UI: show regular-time score when known; else current goals. */
export function extractLiveScores(
  scores: MatchScores | undefined,
): { homeScore: number | null; awayScore: number | null } {
  if (!scores) return { homeScore: null, awayScore: null };
  if (lineValid(scores.fullTime)) {
    return { homeScore: scores.fullTime.home, awayScore: scores.fullTime.away };
  }
  if (lineValid(scores.goals)) {
    return { homeScore: scores.goals.home, awayScore: scores.goals.away };
  }
  return { homeScore: null, awayScore: null };
}

const TERMINAL_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export function isTerminalMatchStatus(statusShort: string): boolean {
  return TERMINAL_STATUSES.has(statusShort);
}
