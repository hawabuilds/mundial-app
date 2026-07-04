import assert from "node:assert/strict";
import {
  extractDisplayScores,
  extractLiveScores,
  extractSettlementScores,
  isTerminalMatchStatus,
} from "./matchScoreSettlement";

assert.deepEqual(
  extractSettlementScores({
    fullTime: { home: 1, away: 1 },
    extraTime: { home: 2, away: 1 },
    penalty: { home: 4, away: 3 },
  }),
  { homeScore: 1, awayScore: 1 },
  "settlement uses 90+injury only, not ET or pens",
);

assert.deepEqual(
  extractSettlementScores({
    fullTime: { home: 0, away: 0 },
    extraTime: { home: 1, away: 0 },
  }),
  { homeScore: 0, awayScore: 0 },
  "ET winner still settles on regulation score",
);

assert.equal(isTerminalMatchStatus("PEN"), true);

assert.deepEqual(
  extractLiveScores({
    goals: { home: 2, away: 1 },
    fullTime: { home: 1, away: 1 },
  }),
  { homeScore: 1, awayScore: 1 },
  "live during ET shows fulltime not cumulative goals",
);

assert.deepEqual(
  extractDisplayScores({
    status: "AET",
    score: {
      goals: { home: 3, away: 2 },
      fullTime: { home: 1, away: 1 },
    },
  }),
  { homeScore: 3, awayScore: 2 },
  "finished after ET shows final total on the board",
);

assert.deepEqual(
  extractDisplayScores({
    status: "FT",
    score: {
      goals: { home: 2, away: 1 },
      fullTime: { home: 2, away: 1 },
    },
  }),
  { homeScore: 2, awayScore: 1 },
  "plain FT shows regulation score",
);

console.log("matchScoreSettlement.test.ts: ok");
