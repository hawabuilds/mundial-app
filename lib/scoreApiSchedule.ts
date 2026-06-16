import type { Fixture } from "@/app/data/fixtures";
import { fixtureDateTime } from "@/app/data/fixtures";

/**
 * Minutes after kickoff when auto-score may call API-Football once per window.
 * Kickoff cron is every 5 min; 15 min window ≈ 3 attempts max, cache dedupes to 1.
 */
/** Covers 90+injury through ET/PEN (settlement uses API fulltime only). */
export const SCORE_API_POLL_OFFSETS_MINUTES = [
  95, 105, 115, 125, 140, 155, 175,
];

export const SCORE_API_POLL_WINDOW_MINUTES = 15;

export function isScoreApiPollDue(
  fixture: Fixture,
  now: Date = new Date(),
): boolean {
  const kickoffMs = fixtureDateTime(fixture).getTime();
  const elapsedMin = (now.getTime() - kickoffMs) / 60_000;

  if (elapsedMin < SCORE_API_POLL_OFFSETS_MINUTES[0]!) return false;

  for (const offsetMin of SCORE_API_POLL_OFFSETS_MINUTES) {
    if (
      elapsedMin >= offsetMin &&
      elapsedMin < offsetMin + SCORE_API_POLL_WINDOW_MINUTES
    ) {
      return true;
    }
  }

  return false;
}
