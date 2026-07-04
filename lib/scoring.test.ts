import assert from "node:assert/strict";
import {
  BASE_EXACT,
  BASE_OUTCOME,
  BASE_PARTICIPATION,
  formatPointsBreakdown,
  getMatchOutcome,
  scorePrediction,
  scorePredictionDetailed,
  scoreReason,
  upsetMultiplier,
} from "./scoring";

type Case = {
  name: string;
  prediction: { homeScore: number; awayScore: number };
  actual: { homeScore: number; awayScore: number };
  expectedPoints: number;
  expectedTier: "exact" | "outcome" | "participation";
};

const cases: Case[] = [
  {
    name: "exact score",
    prediction: { homeScore: 2, awayScore: 1 },
    actual: { homeScore: 2, awayScore: 1 },
    expectedPoints: BASE_EXACT,
    expectedTier: "exact",
  },
  {
    name: "correct home win, wrong scoreline",
    prediction: { homeScore: 3, awayScore: 0 },
    actual: { homeScore: 2, awayScore: 1 },
    expectedPoints: BASE_OUTCOME,
    expectedTier: "outcome",
  },
  {
    name: "correct draw, wrong scoreline",
    prediction: { homeScore: 1, awayScore: 1 },
    actual: { homeScore: 0, awayScore: 0 },
    expectedPoints: BASE_OUTCOME,
    expectedTier: "outcome",
  },
  {
    name: "wrong outcome — predicted home win, actual away win",
    prediction: { homeScore: 2, awayScore: 0 },
    actual: { homeScore: 0, awayScore: 2 },
    expectedPoints: BASE_PARTICIPATION,
    expectedTier: "participation",
  },
  {
    name: "near miss — one team score exact, wrong result",
    prediction: { homeScore: 2, awayScore: 0 },
    actual: { homeScore: 2, awayScore: 2 },
    expectedPoints: BASE_PARTICIPATION,
    expectedTier: "participation",
  },
  {
    name: "participation only",
    prediction: { homeScore: 0, awayScore: 3 },
    actual: { homeScore: 2, awayScore: 2 },
    expectedPoints: BASE_PARTICIPATION,
    expectedTier: "participation",
  },
];

console.log("scoring tests\n");

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  const points = scorePrediction(testCase.prediction, testCase.actual);
  const tier = scoreReason(testCase.prediction, testCase.actual);

  try {
    assert.equal(points, testCase.expectedPoints);
    assert.equal(tier, testCase.expectedTier);
    console.log(`PASS  ${testCase.name}`);
    passed += 1;
  } catch {
    console.log(`FAIL  ${testCase.name}`);
    console.log(`  expected ${testCase.expectedPoints} (${testCase.expectedTier}), got ${points} (${tier})`);
    failed += 1;
  }
}

const odds = { homePct: 85, drawPct: 10, awayPct: 5 };
const upset = scorePredictionDetailed(
  { homeScore: 0, awayScore: 1 },
  { homeScore: 0, awayScore: 1 },
  odds,
);
assert.equal(upset.tier, "exact");
assert.equal(upset.multiplier, 3);
assert.equal(upset.points, 15);
console.log("PASS  market multiplier caps at ×3 for 5% away win");

assert.equal(
  formatPointsBreakdown({ base: 3, multiplier: 1, points: 3 }),
  "Base 3 × Market ×1 = 3 pts",
);
console.log("PASS  formatPointsBreakdown (×1)");

assert.equal(
  formatPointsBreakdown({ base: 3, multiplier: 3, points: 9 }),
  "Base 3 × Market ×3 = 9 pts",
);
console.log("PASS  formatPointsBreakdown");

assert.equal(upsetMultiplier("away", odds), 3);
assert.equal(getMatchOutcome({ homeScore: 1, awayScore: 1 }), "draw");
assert.equal(getMatchOutcome({ homeScore: 2, awayScore: 0 }), "home");
assert.equal(getMatchOutcome({ homeScore: 0, awayScore: 1 }), "away");

console.log(`\n${passed + 3} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
