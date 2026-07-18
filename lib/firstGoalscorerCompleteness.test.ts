import assert from "node:assert/strict";
import type { StoredGoal } from "@/app/lib/supabase";
import { deriveMarketFirstGoalscorer } from "./firstGoalscorer";
import {
  assessGoalDataCompleteness,
  needsGoalDataBackfill,
} from "./firstGoalscorerCompleteness";

console.log("firstGoalscorerCompleteness tests\n");

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${error instanceof Error ? error.message : error}`);
  }
}

function goal(partial: Partial<StoredGoal> & Pick<StoredGoal, "side">): StoredGoal {
  return {
    minute: null,
    player: null,
    playerShort: null,
    playerId: null,
    clockSeconds: null,
    seq: null,
    ownGoal: false,
    penalty: false,
    ...partial,
  };
}

run("0-0 with no rows is complete and settleable", () => {
  const assessment = assessGoalDataCompleteness([], 0, 0);
  assert.equal(assessment.status, "complete");
  assert.equal(assessment.settleableForFirstScorer, true);
  assert.equal(assessment.firstGoalscorer, null);
});

run("named goals matching FT with play-by-play fields is complete", () => {
  const goals = [
    goal({
      side: "home",
      minute: 23,
      player: "Luis Rodriguez",
      playerId: 101,
      clockSeconds: 23 * 60,
      seq: 10,
    }),
    goal({
      side: "away",
      minute: 55,
      player: "Mohammed Kudus",
      playerId: 201,
      clockSeconds: 55 * 60,
      seq: 20,
    }),
    goal({
      side: "home",
      minute: 78,
      player: "Luis Rodriguez",
      playerId: 101,
      clockSeconds: 78 * 60,
      seq: 30,
    }),
  ];
  const assessment = assessGoalDataCompleteness(goals, 2, 1);
  assert.equal(assessment.status, "complete");
  assert.equal(assessment.settleableForFirstScorer, true);
  assert.equal(assessment.firstGoalscorer?.playerId, 101);
  assert.equal(assessment.firstGoalscorer?.clockSeconds, 23 * 60);
});

run("unknown scorer name makes data incomplete", () => {
  const goals = [
    goal({
      side: "away",
      minute: 45,
      player: null,
      clockSeconds: 45 * 60,
      seq: 5,
    }),
  ];
  const assessment = assessGoalDataCompleteness(goals, 0, 1);
  assert.equal(assessment.status, "incomplete");
  assert.equal(assessment.settleableForFirstScorer, false);
});

run("missing clock_seconds makes data incomplete", () => {
  const goals = [
    goal({
      side: "away",
      minute: 69,
      player: "Kylian Mbappe Lottin",
      playerId: 453928,
      seq: 693,
      penalty: true,
    }),
  ];
  const assessment = assessGoalDataCompleteness(goals, 0, 1);
  assert.equal(assessment.status, "incomplete");
  assert.equal(assessment.settleableForFirstScorer, false);
  assert.ok(needsGoalDataBackfill(goals, 0, 1));
});

run("market first scorer skips own goal for earliest proper goal", () => {
  const goals = [
    goal({
      side: "away",
      minute: 44,
      player: "Own Goal Taker",
      playerId: 1,
      clockSeconds: 44 * 60,
      seq: 10,
      ownGoal: true,
    }),
    goal({
      side: "home",
      minute: 55,
      player: "Proper Scorer",
      playerId: 2,
      clockSeconds: 55 * 60,
      seq: 20,
    }),
  ];
  const first = deriveMarketFirstGoalscorer(goals);
  assert.equal(first?.player, "Proper Scorer");
  assert.equal(first?.playerId, 2);
  const assessment = assessGoalDataCompleteness(goals, 1, 1);
  assert.equal(assessment.settleableForFirstScorer, true);
  assert.equal(assessment.firstGoalscorer?.player, "Proper Scorer");
});

run("scored penalty counts as market first goalscorer", () => {
  const goals = [
    goal({
      side: "away",
      minute: 69,
      player: "Kylian Mbappe Lottin",
      playerId: 453928,
      clockSeconds: 69 * 60,
      seq: 693,
      penalty: true,
    }),
  ];
  const assessment = assessGoalDataCompleteness(goals, 0, 1);
  assert.equal(assessment.settleableForFirstScorer, true);
  assert.equal(assessment.firstGoalscorer?.penalty, true);
});

run("count mismatch is incomplete", () => {
  const goals = [
    goal({
      side: "home",
      minute: 10,
      player: "A",
      playerId: 1,
      clockSeconds: 600,
      seq: 1,
    }),
  ];
  const assessment = assessGoalDataCompleteness(goals, 2, 0);
  assert.equal(assessment.status, "incomplete");
  assert.ok(assessment.reasons.some((reason) => reason.includes("home goal rows")));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
