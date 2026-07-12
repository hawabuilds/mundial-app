/**
 * Hardcoded QF matches that missed X reply collection while the API returned 503.
 * Tweet IDs are the @copamundialapp match-thread posts (replies = predictions).
 */
export type PredictionBackfillTarget = {
  matchId: number;
  tweetId: string;
  home: string;
  away: string;
  /** YYYY-MM-DD UTC — used only for fixtureCacheKey when seeding tweet id. */
  date: string;
};

export const PREDICTION_BACKFILL_TARGETS: readonly PredictionBackfillTarget[] = [
  {
    matchId: 18213979,
    tweetId: "2075995261210386810",
    home: "Norway",
    away: "England",
    date: "2026-07-11",
  },
  {
    matchId: 18222446,
    tweetId: "2076086965921792310",
    home: "Argentina",
    away: "Switzerland",
    date: "2026-07-12",
  },
] as const;

/** Stop retrying after this many cron attempts (~24h at every-15-min). */
export const PREDICTION_BACKFILL_MAX_ATTEMPTS = 96;

/** Absolute wall-clock window from first seed. */
export const PREDICTION_BACKFILL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
