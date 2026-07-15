import assert from "node:assert/strict";

import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";

import {
  COLLECTION_BACKLOG_MAX_HOURS_AFTER_KICKOFF,
  COLLECTION_RETRY_OFFSETS_MINUTES,
  COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF,
  getFixturesDueForCollection,
  isCollectionRetryDue,
  isWithinCollectionBacklogWindow,
  isWithinCollectionWindow,
  shouldCollectPredictions,
  shouldCollectPredictionsBacklog,
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

assert.equal(
  shouldCollectPredictions(
    fixture,
    new Date(kickoff.getTime() + 40 * 60_000),
    null,
  ),
  true,
  "never collected: due between slots after first slot opens",
);

assert.equal(
  shouldCollectPredictions(
    fixture,
    new Date(kickoff.getTime() + 70 * 60_000),
    null,
  ),
  true,
  "never collected: due in former dead zone after +55 slot",
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

assert.equal(
  shouldCollectPredictionsBacklog(
    fixture,
    new Date(kickoff.getTime() + 6 * 60_000),
  ),
  false,
  "inside slot window: backlog does not run",
);

assert.equal(
  shouldCollectPredictionsBacklog(
    fixture,
    new Date(kickoff.getTime() + (COLLECTION_WINDOW_MINUTES_AFTER_KICKOFF + 10) * 60_000),
  ),
  true,
  "past slot window: backlog retries every cron",
);

assert.equal(
  isWithinCollectionBacklogWindow(
    fixture,
    new Date(
      kickoff.getTime() +
        (COLLECTION_BACKLOG_MAX_HOURS_AFTER_KICKOFF * 60 + 10) * 60_000,
    ),
  ),
  false,
  "past backlog horizon: stop retrying",
);

console.log("kickoff.test.ts: ok");
