import assert from "node:assert/strict";
import {
  boardMatchHasStarted,
  boardMatchIsLive,
} from "./boardMatchPhase";

console.log("boardMatchPhase tests\n");

assert.equal(boardMatchHasStarted(2, null), true, "GameState 1H counts as started");
assert.equal(boardMatchHasStarted(1, null), false, "GameState NS alone is not started");
assert.equal(
  boardMatchHasStarted(1, {
    externalFixtureId: 1,
    status: "LIVE",
    homeScore: 0,
    awayScore: 0,
    elapsed: 12,
  }),
  true,
  "scores feed LIVE counts as started even when snapshot GameState lags",
);
assert.equal(
  boardMatchHasStarted(1, {
    externalFixtureId: 1,
    status: "NS",
    homeScore: null,
    awayScore: null,
    elapsed: null,
  }),
  false,
  "NS feed with NS GameState stays upcoming",
);

assert.equal(
  boardMatchIsLive(1, {
    externalFixtureId: 1,
    status: "LIVE",
    homeScore: 1,
    awayScore: 0,
    elapsed: 34,
  }),
  true,
);
assert.equal(
  boardMatchIsLive(5, {
    externalFixtureId: 1,
    status: "FT",
    homeScore: 2,
    awayScore: 1,
    elapsed: null,
  }),
  false,
);

console.log("boardMatchPhase tests: ok");
