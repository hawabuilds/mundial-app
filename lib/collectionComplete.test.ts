import assert from "node:assert/strict";
import { shouldMarkMatchCollected } from "./collectionComplete";
import type { CollectResult } from "./collectPredictions";

const base: CollectResult = {
  matchId: 13,
  fixture: "Poland vs Ukraine",
  tweetId: "1",
  repliesFetched: 0,
  validPredictionsSaved: 0,
  rejectedPredictions: 0,
  skippedDuplicateAuthors: 0,
  skippedAfterKickoff: 0,
};

assert.equal(shouldMarkMatchCollected(base), false);
assert.equal(
  shouldMarkMatchCollected({ ...base, repliesFetched: 3, validPredictionsSaved: 0 }),
  true,
);
assert.equal(
  shouldMarkMatchCollected({ ...base, repliesFetched: 2, validPredictionsSaved: 2 }),
  true,
);

console.log("collectionComplete.test.ts: ok");
