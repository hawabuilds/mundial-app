import assert from "node:assert/strict";

import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";

import {

  COLLECTION_RETRY_OFFSETS_MINUTES,

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

    new Date(kickoff.getTime() + 49 * 60 * 60 * 1000),

  ),

  false,

  "more than 48h after kickoff: out of window",

);



assert.equal(

  shouldCollectPredictions(fixture, new Date(kickoff.getTime() + 5 * 60_000), null),

  true,

  "never collected: due during bootstrap window",

);



assert.equal(

  shouldCollectPredictions(

    fixture,

    new Date(kickoff.getTime() + 3 * 60 * 60 * 1000),

    new Date(kickoff.getTime() + 10 * 60_000),

  ),

  false,

  "collected at +10m: not due between retry slots",

);



const retryOffset = COLLECTION_RETRY_OFFSETS_MINUTES[1]!;

assert.equal(

  isCollectionRetryDue(

    fixture,

    new Date(kickoff.getTime() + (retryOffset + 2) * 60_000),

    new Date(kickoff.getTime() + 5 * 60_000),

  ),

  true,

  "collected before +15m slot: due in +15m window",

);



assert.equal(

  isCollectionRetryDue(

    fixture,

    new Date(kickoff.getTime() + 5 * 60_000),

    new Date(kickoff.getTime() - 30 * 60_000),

  ),

  true,

  "collected before kickoff: due after kickoff for final reply sweep",

);



console.log("kickoff.test.ts: ok");

