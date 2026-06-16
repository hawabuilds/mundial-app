import assert from "node:assert/strict";
import {
  FIXTURES,
  LANDING_DAY_WINDOW,
  fixtureDateTime,
  formatFixtureKickoffLine,
  getActiveFixtures,
  getLandingFixturesForWindow,
  getNextFixture,
  getUniqueUpcomingDates,
  getUpcomingDateWindow,
  getUpcomingFixtures,
  getUpcomingFixturesForDates,
  isFixtureNotStarted,
} from "../app/data/fixtures";

const first = FIXTURES[0]!;

assert.equal(first.id, 1);
assert.equal(first.home, "Mexico");
assert.equal(getActiveFixtures(FIXTURES).length, 72);

const beforeKickoff = new Date(fixtureDateTime(first).getTime() - 60_000);
const afterKickoff = new Date(fixtureDateTime(first).getTime() + 60_000);

assert.equal(isFixtureNotStarted(first, beforeKickoff), true);
assert.equal(isFixtureNotStarted(first, afterKickoff), false);

const beforeWorldCup = new Date("2026-06-11T18:00:00Z");
const upcoming = getUpcomingFixtures(FIXTURES, beforeWorldCup);
assert.ok(upcoming.length >= 4);
assert.equal(getNextFixture(FIXTURES, beforeWorldCup)?.id, 1);

const landing = getLandingFixturesForWindow(FIXTURES, beforeWorldCup, 0);
assert.ok(landing.length >= 1);
assert.equal(landing[0]?.id, 1);
assert.match(formatFixtureKickoffLine(first), /Jun 11 · 19:00 UTC/);

const dates = getUniqueUpcomingDates(upcoming);
assert.ok(dates.length >= 2);
const window = getUpcomingDateWindow(upcoming, 0, LANDING_DAY_WINDOW);
assert.equal(window.length, 2);
assert.equal(
  getLandingFixturesForWindow(FIXTURES, beforeWorldCup, 0).length,
  getUpcomingFixturesForDates(upcoming, window).length,
);

console.log("fixtures.test.ts: ok");
