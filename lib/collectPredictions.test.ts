import assert from "node:assert/strict";
import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";
import { isReplyBeforeKickoff } from "./predictionEligibility";

const fixture = FIXTURES[0]!;
const kickoff = fixtureDateTime(fixture);

assert.equal(
  isReplyBeforeKickoff(
    new Date(kickoff.getTime() - 1000).toISOString(),
    fixture,
  ),
  true,
  "one second before kickoff counts",
);

assert.equal(
  isReplyBeforeKickoff(kickoff.toISOString(), fixture),
  false,
  "at kickoff does not count",
);

assert.equal(
  isReplyBeforeKickoff(
    new Date(kickoff.getTime() + 45 * 60_000).toISOString(),
    fixture,
  ),
  false,
  "after kickoff does not count",
);

console.log("collectPredictions.test.ts: ok");
