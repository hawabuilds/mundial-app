import assert from "node:assert/strict";
import {
  fixtureKickoffKey,
  getNextKickoffSlotFixtures,
  getUpcomingFixturesOnDate,
  type Fixture,
} from "../app/data/fixtures";

const sample: Fixture[] = [
  {
    id: 1,
    home: "Iran",
    away: "A",
    date: "2026-05-29",
    time: "15:30",
    group: "Test",
  },
  {
    id: 2,
    home: "B",
    away: "C",
    date: "2026-05-29",
    time: "16:00",
    group: "Test",
  },
  {
    id: 3,
    home: "D",
    away: "E",
    date: "2026-05-29",
    time: "16:00",
    group: "Test",
  },
  {
    id: 4,
    home: "F",
    away: "G",
    date: "2026-05-29",
    time: "19:00",
    group: "Test",
  },
];

const beforeIran = new Date("2026-05-29T15:00:00Z");
const upcoming = sample.filter(
  (fixture) => new Date(`${fixture.date}T${fixture.time}:00Z`) > beforeIran,
);

assert.equal(upcoming.length, 4);
assert.equal(getNextKickoffSlotFixtures(upcoming).length, 1);
assert.equal(getNextKickoffSlotFixtures(upcoming)[0]?.home, "Iran");

const afterIran = new Date("2026-05-29T15:31:00Z");
const midDay = sample.filter(
  (fixture) => new Date(`${fixture.date}T${fixture.time}:00Z`) > afterIran,
);
assert.equal(getNextKickoffSlotFixtures(midDay).length, 2);
assert.equal(
  new Set(getNextKickoffSlotFixtures(midDay).map(fixtureKickoffKey)).size,
  1,
);

assert.equal(getUpcomingFixturesOnDate(midDay, "2026-05-29").length, 3);

console.log("dashboardFixtures.test.ts: ok");
