import assert from "node:assert/strict";
import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";
import { isScoreApiPollDue } from "./scoreApiSchedule";

const fixture = FIXTURES.find((f) => f.id === 10)!;
const kickoff = fixtureDateTime(fixture);

assert.equal(
  isScoreApiPollDue(fixture, new Date(kickoff.getTime() + 80 * 60_000)),
  false,
  "before first poll window",
);

assert.equal(
  isScoreApiPollDue(fixture, new Date(kickoff.getTime() + 100 * 60_000)),
  true,
  "inside first poll window",
);

assert.equal(
  isScoreApiPollDue(fixture, new Date(kickoff.getTime() + 112 * 60_000)),
  false,
  "between poll windows",
);

console.log("scoreApiSchedule.test.ts: ok");
