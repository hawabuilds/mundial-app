import assert from "node:assert/strict";
import { FIXTURES, fixtureDateTime } from "@/app/data/fixtures";
import {
  isReplyBeforeKickoff,
} from "./predictionEligibility";
import { resolveKickoffMs } from "./effectiveKickoff";
import {
  isCollectionRetryDue,
  isWithinCollectionWindow,
  shouldCollectPredictions,
} from "./kickoff";

const fixture = FIXTURES[0]!;
const scheduled = fixtureDateTime(fixture).getTime();
const delayed = scheduled + 60 * 60_000;

console.log("effectiveKickoff tests\n");

assert.equal(
  isReplyBeforeKickoff(
    new Date(delayed - 30 * 60_000).toISOString(),
    fixture,
    delayed,
  ),
  true,
  "reply 30m after scheduled but before delayed kickoff is valid",
);

assert.equal(
  isReplyBeforeKickoff(
    new Date(scheduled + 30 * 60_000).toISOString(),
    fixture,
    delayed,
  ),
  true,
  "reply between scheduled and delayed kickoff stays valid with TxLINE StartTime",
);

assert.equal(
  isWithinCollectionWindow(fixture, new Date(scheduled + 10 * 60_000), delayed),
  false,
  "collection waits until effective kickoff when delayed",
);

assert.equal(
  isWithinCollectionWindow(fixture, new Date(delayed + 10 * 60_000), delayed),
  true,
  "collection opens after delayed kickoff",
);

assert.equal(
  shouldCollectPredictions(
    fixture,
    new Date(delayed + 6 * 60_000),
    null,
    delayed,
  ),
  true,
  "first collection slot follows delayed kickoff",
);

assert.equal(
  isCollectionRetryDue(
    fixture,
    new Date(scheduled + 6 * 60_000),
    null,
    delayed,
  ),
  false,
  "scheduled-time collection slot is skipped when kickoff is delayed",
);

assert.equal(resolveKickoffMs(fixture, delayed), delayed);

console.log("effectiveKickoff tests: ok");
