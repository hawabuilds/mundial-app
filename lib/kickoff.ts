import {
  FIXTURES,
  fixtureDateTime,
  getActiveFixtures,
  isFixtureCancelled,
  type Fixture,
} from "../app/data/fixtures";



/** Stop attempting collection this long after kickoff. */

export const COLLECTION_WINDOW_HOURS_AFTER_KICKOFF = 48;



/**

 * Minutes after kickoff when we re-fetch X replies (index lag).

 * Cron runs every 5 minutes; each slot has a {@link COLLECTION_RETRY_WINDOW_MINUTES} window.

 */

export const COLLECTION_RETRY_OFFSETS_MINUTES = [0, 15, 60, 360, 1440];



/** Width of each retry slot — must be >= cron interval (5 min). */

export const COLLECTION_RETRY_WINDOW_MINUTES = 12;



/**

 * Until the first successful collect, retry every cron within this window

 * (then only at {@link COLLECTION_RETRY_OFFSETS_MINUTES}).

 */

export const COLLECTION_BOOTSTRAP_HOURS_AFTER_KICKOFF = 2;



export function isWithinCollectionWindow(

  fixture: Fixture,

  now: Date = new Date(),

): boolean {
  if (isFixtureCancelled(fixture)) return false;

  const kickoffMs = fixtureDateTime(fixture).getTime();
  const elapsedMs = now.getTime() - kickoffMs;
  const maxMs = COLLECTION_WINDOW_HOURS_AFTER_KICKOFF * 60 * 60 * 1000;
  return elapsedMs >= 0 && elapsedMs <= maxMs;
}



export function isCollectionRetryDue(

  fixture: Fixture,

  now: Date = new Date(),

  lastCollectedAt: Date | null = null,

): boolean {

  if (!isWithinCollectionWindow(fixture, now)) return false;



  const kickoffMs = fixtureDateTime(fixture).getTime();

  const elapsedMin = (now.getTime() - kickoffMs) / 60_000;



  if (!lastCollectedAt) {

    return (

      elapsedMin < COLLECTION_BOOTSTRAP_HOURS_AFTER_KICKOFF * 60

    );

  }



  const lastMs = lastCollectedAt.getTime();

  if (lastMs < kickoffMs && now.getTime() >= kickoffMs) {
    return true;
  }



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

): boolean {

  return isCollectionRetryDue(fixture, now, lastCollectedAt);

}



export function getFixturesDueForCollection(

  now: Date = new Date(),

  fixtures: Fixture[] = getActiveFixtures(FIXTURES),

): Fixture[] {
  return fixtures.filter((fixture) => isWithinCollectionWindow(fixture, now));
}



export async function filterFixturesForCollection(

  fixtures: Fixture[],

  getLastCollectedAt: (matchId: number) => Promise<Date | null>,

  now: Date = new Date(),

): Promise<Fixture[]> {

  const due: Fixture[] = [];



  for (const fixture of fixtures) {

    const lastCollectedAt = await getLastCollectedAt(fixture.id);

    if (shouldCollectPredictions(fixture, now, lastCollectedAt)) {

      due.push(fixture);

    }

  }



  return due;

}



/** @deprecated Use {@link COLLECTION_WINDOW_HOURS_AFTER_KICKOFF} — kept for scripts/tests. */

export const MAX_COLLECTION_DAYS_AFTER_KICKOFF =

  COLLECTION_WINDOW_HOURS_AFTER_KICKOFF / 24;


