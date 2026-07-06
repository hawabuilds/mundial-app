import {
  FIXTURES,
  fixtureDateTime,
  getActiveFixtures,
  isFixtureCancelled,
  type Fixture,
} from "../app/data/fixtures";
import {
  MAX_KICKOFF_DELAY_HOURS,
  resolveKickoffMs,
} from "./effectiveKickoff";

/** Post-kickoff window for X reply collection (predictions are pre-kickoff). */
export const COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF = 90;

/**
 * Exactly three collection attempts — one per slot (cron runs every 5 min).
 * Offsets: ~5 min, ~25 min, ~55 min after kickoff (X index lag).
 */
export const COLLECTION_RETRY_OFFSETS_MINUTES = [5, 25, 55];

/** Must match cron interval so each slot fires at most once. */
export const COLLECTION_RETRY_WINDOW_MINUTES = 5;

export const MAX_COLLECTION_ATTEMPTS = COLLECTION_RETRY_OFFSETS_MINUTES.length;

export function isWithinCollectionWindow(
  fixture: Fixture,
  now: Date = new Date(),
  effectiveKickoffMs?: number,
): boolean {
  if (isFixtureCancelled(fixture)) return false;

  const kickoffMs = resolveKickoffMs(fixture, effectiveKickoffMs);
  const elapsedMin = (now.getTime() - kickoffMs) / 60_000;
  return (
    elapsedMin >= 0 &&
    elapsedMin <= COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF
  );
}

export function isCollectionRetryDue(
  fixture: Fixture,
  now: Date = new Date(),
  lastCollectedAt: Date | null = null,
  effectiveKickoffMs?: number,
): boolean {
  if (!isWithinCollectionWindow(fixture, now, effectiveKickoffMs)) return false;

  const kickoffMs = resolveKickoffMs(fixture, effectiveKickoffMs);
  const elapsedMin = (now.getTime() - kickoffMs) / 60_000;
  const lastMs = lastCollectedAt?.getTime() ?? 0;

  for (const offsetMin of COLLECTION_RETRY_OFFSETS_MINUTES) {
    if (
      elapsedMin >= offsetMin &&
      elapsedMin < offsetMin + COLLECTION_RETRY_WINDOW_MINUTES
    ) {
      return lastMs < kickoffMs + offsetMin * 60_000;
    }
  }

  return false;
}

export function shouldCollectPredictions(
  fixture: Fixture,
  now: Date = new Date(),
  lastCollectedAt: Date | null = null,
  effectiveKickoffMs?: number,
): boolean {
  return isCollectionRetryDue(fixture, now, lastCollectedAt, effectiveKickoffMs);
}

export function getFixturesDueForCollection(
  now: Date = new Date(),
  fixtures: Fixture[] = getActiveFixtures(FIXTURES),
): Fixture[] {
  const nowMs = now.getTime();

  return fixtures.filter((fixture) => {
    const scheduledMs = fixtureDateTime(fixture).getTime();
    const elapsedSinceScheduledMin = (nowMs - scheduledMs) / 60_000;
    if (elapsedSinceScheduledMin < 0) return false;
    return (
      elapsedSinceScheduledMin <=
      COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF + MAX_KICKOFF_DELAY_HOURS * 60
    );
  });
}

export async function filterFixturesForCollection(
  fixtures: Fixture[],
  getLastCollectedAt: (matchId: number) => Promise<Date | null>,
  isCollected: (matchId: number) => Promise<boolean>,
  now: Date = new Date(),
  resolveEffectiveKickoffMs?: (fixture: Fixture) => number | null | undefined,
): Promise<Fixture[]> {
  const due: Fixture[] = [];

  for (const fixture of fixtures) {
    if (await isCollected(fixture.id)) continue;

    const effectiveKickoffMs = resolveEffectiveKickoffMs?.(fixture);
    const lastCollectedAt = await getLastCollectedAt(fixture.id);
    if (shouldCollectPredictions(fixture, now, lastCollectedAt, effectiveKickoffMs ?? undefined)) {
      due.push(fixture);
    }
  }

  return due;
}

/** @deprecated Use {@link COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF}. */
export const COLLECTION_WINDOW_HOURS_AFTER_KICKOFF =
  COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF / 60;

/** @deprecated Use {@link COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF}. */
export const MAX_COLLECTION_DAYS_AFTER_KICKOFF =
  COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF / (60 * 24);
