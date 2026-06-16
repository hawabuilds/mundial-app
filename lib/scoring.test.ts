import assert from "node:assert/strict";
import {
  getMatchOutcome,
  POINTS_EXACT,
  POINTS_OUTCOME,
  POINTS_PARTICIPATION,
  scorePrediction,
  scoreReason,
} from "./scoring";

type Case = {
  name: string;
  prediction: { homeScore: number; awayScore: number };
  actual: { homeScore: number; awayScore: number };
  expectedPoints: number;
  expectedReason: "exact" | "outcome" | "participation";
};

const cases: Case[] = [
  {
    name: "exact score",
    prediction: { homeScore: 2, awayScore: 1 },
    actual: { homeScore: 2, awayScore: 1 },
    expectedPoints: POINTS_EXACT,
    expectedReason: "exact",
  },
  {
    name: "correct home win, wrong scoreline",
    prediction: { homeScore: 3, awayScore: 0 },
    actual: { homeScore: 2, awayScore: 1 },
    expectedPoints: POINTS_OUTCOME,
    expectedReason: "outcome",
  },
  {
    name: "correct draw, wrong scoreline",
    prediction: { homeScore: 1, awayScore: 1 },
    actual: { homeScore: 0, awayScore: 0 },
    expectedPoints: POINTS_OUTCOME,
    expectedReason: "outcome",
  },
  {
    name: "wrong outcome — predicted home win, actual away win",
    prediction: { homeScore: 2, awayScore: 0 },
    actual: { homeScore: 0, awayScore: 2 },
    expectedPoints: POINTS_PARTICIPATION,
    expectedReason: "participation",
  },
  {
    name: "wrong outcome — predicted draw, actual win",
    prediction: { homeScore: 1, awayScore: 1 },
    actual: { homeScore: 2, awayScore: 0 },
    expectedPoints: POINTS_PARTICIPATION,
    expectedReason: "participation",
  },
  {
    name: "participation only",
    prediction: { homeScore: 0, awayScore: 3 },
    actual: { homeScore: 2, awayScore: 2 },
    expectedPoints: POINTS_PARTICIPATION,
    expectedReason: "participation",
  },
];

console.log("scoring tests\n");

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  const points = scorePrediction(testCase.prediction, testCase.actual);
  const reason = scoreReason(testCase.prediction, testCase.actual);

  try {
    assert.equal(points, testCase.expectedPoints);
    assert.equal(reason, testCase.expectedReason);
    console.log(`PASS  ${testCase.name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL  ${testCase.name}`);
    console.log(`  expected ${testCase.expectedPoints} (${testCase.expectedReason}), got ${points} (${reason})`);
    failed += 1;
  }
}

assert.equal(getMatchOutcome({ homeScore: 1, awayScore: 1 }), "draw");
assert.equal(getMatchOutcome({ homeScore: 2, awayScore: 0 }), "home");
assert.equal(getMatchOutcome({ homeScore: 0, awayScore: 1 }), "away");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
