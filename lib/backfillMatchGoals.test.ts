import assert from "node:assert/strict";
import {
  countGoalsBySide,
  deriveMatchGoalsFromScoreSequence,
  isMatchGoalsInconsistentWithScore,
} from "./backfillMatchGoals";
import type { StoredGoal } from "@/app/lib/supabase";
import { parseScoreSequenceBody, type TxScoreEvent } from "./txodds";

/** Mock historical sequence: 2-1 FT with three named goals (per TxLINE Scores shape). */
const MOCK_SEQUENCE: TxScoreEvent[] = [
  {
    FixtureId: 18179549,
    Action: "lineups",
    Seq: 1,
    Participant1IsHome: true,
    Lineups: [
      {
        preferredName: "Colombia",
        lineups: [
          { player: { normativeId: 101, preferredName: "Rodriguez, Luis" } },
        ],
      },
      {
        preferredName: "Ghana",
        lineups: [
          { player: { normativeId: 201, preferredName: "Kudus, Mohammed" } },
        ],
      },
    ],
  },
  {
    FixtureId: 18179549,
    Action: "goal",
    Seq: 10,
    Participant: 1,
    Participant1IsHome: true,
    Clock: { Seconds: 23 * 60 },
    Data: { PlayerId: 101, PreferredName: "Rodriguez, Luis" },
    Stats: { "1001": 1, "1002": 0 },
  },
  {
    FixtureId: 18179549,
    Action: "goal",
    Seq: 20,
    Participant: 2,
    Participant1IsHome: true,
    Clock: { Seconds: 55 * 60 },
    Data: { PlayerId: 201, PreferredName: "Kudus, Mohammed" },
    Stats: { "1001": 1, "1002": 1 },
  },
  {
    FixtureId: 18179549,
    Action: "goal",
    Seq: 30,
    Participant: 1,
    Participant1IsHome: true,
    Clock: { Seconds: 78 * 60 },
    Data: { PlayerId: 101, PreferredName: "Rodriguez, Luis" },
    Stats: { "1001": 2, "1002": 1, "3001": 2, "3002": 1 },
    StatusId: 5,
  },
];

console.log("backfillMatchGoals tests\n");

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

run("isMatchGoalsInconsistentWithScore detects count mismatch", () => {
  const goals: StoredGoal[] = [
    { minute: 23, side: "home", player: "Luis Rodriguez", ownGoal: false },
  ];
  assert.equal(isMatchGoalsInconsistentWithScore(goals, 2, 1), true);
});

run("isMatchGoalsInconsistentWithScore detects missing scorers", () => {
  const goals: StoredGoal[] = [
    { minute: 23, side: "home", player: "Luis Rodriguez", ownGoal: false },
    { minute: 55, side: "away", player: null, ownGoal: false },
    { minute: 78, side: "home", player: "Luis Rodriguez", ownGoal: false },
  ];
  assert.equal(isMatchGoalsInconsistentWithScore(goals, 2, 1), true);
});

run("isMatchGoalsInconsistentWithScore passes when complete", () => {
  const goals: StoredGoal[] = [
    { minute: 23, side: "home", player: "Luis Rodriguez", ownGoal: false },
    { minute: 55, side: "away", player: "Mohammed Kudus", ownGoal: false },
    { minute: 78, side: "home", player: "Luis Rodriguez", ownGoal: false },
  ];
  assert.equal(isMatchGoalsInconsistentWithScore(goals, 2, 1), false);
});

run("deriveMatchGoalsFromScoreSequence rebuilds 2-1 from mock historical sequence", () => {
  const goals = deriveMatchGoalsFromScoreSequence(MOCK_SEQUENCE, true, 2, 1);
  const counts = countGoalsBySide(goals);
  assert.equal(counts.home, 2);
  assert.equal(counts.away, 1);
  assert.equal(goals.length, 3);
  assert.ok(goals.every((goal) => goal.player));
  assert.equal(goals[0]?.minute, 23);
  assert.equal(goals[1]?.minute, 55);
  assert.equal(goals[2]?.minute, 78);
});

run("deriveMatchGoalsFromScoreSequence is idempotent on re-merge keys", () => {
  const first = deriveMatchGoalsFromScoreSequence(MOCK_SEQUENCE, true, 2, 1);
  const second = deriveMatchGoalsFromScoreSequence(MOCK_SEQUENCE, true, 2, 1);
  assert.deepEqual(first, second);
});

run("parseScoreSequenceBody accepts SSE data lines from historical endpoint", () => {
  const sse = [
    'data: {"FixtureId":1,"Action":"goal","Seq":1,"Participant":1,"Participant1IsHome":true,"Clock":{"Seconds":1380},"Data":{"PreferredName":"Rodriguez, Luis"},"Stats":{"1001":1,"1002":0}}',
    "id: 0",
    "",
    'data: {"FixtureId":1,"Action":"goal","Seq":2,"Participant":2,"Participant1IsHome":true,"Clock":{"Seconds":3300},"Data":{"PreferredName":"Kudus, Mohammed"},"Stats":{"1001":1,"1002":1}}',
  ].join("\n");
  const events = parseScoreSequenceBody(sse);
  assert.equal(events.length, 2);
  const goals = deriveMatchGoalsFromScoreSequence(events, true, 1, 1);
  assert.equal(goals.length, 2);
  assert.ok(goals.every((goal) => goal.player));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
