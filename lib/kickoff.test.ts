import assert from "node:assert/strict";

import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";

import {
  COLLECTION_RETRY_OFFSETS_MINUTES,
  COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF,
  getFixturesDueForCollection,
  isCollectionRetryDue,
  isWithinCollectionWindow,
  shouldCollectPredictions,
} from "./kickoff";

const fixture = FIXTURES[0]!;
const kickoff = fixtureDateTime(fixture);

assert.equal(
  getFixturesDueForCollection(new Date(kickoff.getTime() - 1000)).length,
  0,
  "before kickoff: nothing in window",
);

assert.equal(
  isWithinCollectionWindow(fixture, new Date(kickoff.getTime() + 60_000)),
  true,
  "after kickoff: in window",
);

assert.equal(
  isWithinCollectionWindow(
    fixture,
    new Date(kickoff.getTime() + (COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF + 5) * 60_000),
  ),
  false,
  "past collection window: out",
);

assert.equal(
  shouldCollectPredictions(fixture, new Date(kickoff.getTime() + 6 * 60_000), null),
  true,
  "first slot (+5 min): due",
);

assert.equal(
  shouldCollectPredictions(
    fixture,
    new Date(kickoff.getTime() + 3 * 60 * 60 * 1000),
    null,
  ),
  false,
  "outside window: not due",
);

assert.equal(
  shouldCollectPredictions(
    fixture,
    new Date(kickoff.getTime() + 40 * 60_000),
    new Date(kickoff.getTime() + 6 * 60_000),
  ),
  false,
  "collected in slot 1: not due between slots",
);

const retryOffset = COLLECTION_RETRY_OFFSETS_MINUTES[1]!;
assert.equal(
  isCollectionRetryDue(
    fixture,
    new Date(kickoff.getTime() + retryOffset * 60_000),
    new Date(kickoff.getTime() + 6 * 60_000),
  ),
  true,
  "collected in slot 1: due in slot 2",
);

assert.equal(COLLECTION_RETRY_OFFSETS_MINUTES.length, 3, "exactly 3 collection attempts");

console.log("kickoff.test.ts: ok");
