import assert from "node:assert/strict";
import {
  countGoalsBySide,
  deriveMatchGoalsFromScoreSequence,
  isMatchGoalsInconsistentWithScore,
} from "./backfillMatchGoals";
import type { StoredGoal } from "@/app/lib/supabase";
import { parseScoreSequenceBody, extractGoals, type TxScoreEvent } from "./txodds";
import { deriveFirstGoalscorer } from "./firstGoalscorer";

function storedGoal(
  partial: Partial<StoredGoal> & Pick<StoredGoal, "minute" | "side" | "ownGoal">,
): StoredGoal {
  return {
    player: null,
    playerShort: null,
    playerId: null,
    clockSeconds: null,
    seq: null,
    penalty: false,
    ...partial,
  };
}

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

/** Penalty scored via penalty_outcome — period stats only give minute, not scorer. */
const MOCK_PENALTY_SEQUENCE: TxScoreEvent[] = [
  {
    FixtureId: 18188721,
    Action: "lineups",
    Seq: 1,
    Participant1IsHome: true,
    Lineups: [
      { preferredName: "Paraguay", lineups: [] },
      {
        preferredName: "France",
        lineups: [
          { player: { normativeId: 453928, preferredName: "Mbappe Lottin, Kylian" } },
        ],
      },
    ],
  },
  {
    FixtureId: 18188721,
    Action: "penalty_outcome",
    Seq: 693,
    Participant: 2,
    Participant1IsHome: true,
    Clock: { Seconds: 69 * 60 },
    Data: { Outcome: "Scored", PlayerId: 453928 },
    Stats: { "3001": 0, "3002": 1 },
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
    storedGoal({ minute: 23, side: "home", player: "Luis Rodriguez", ownGoal: false }),
  ];
  assert.equal(isMatchGoalsInconsistentWithScore(goals, 2, 1), true);
});

run("isMatchGoalsInconsistentWithScore detects missing scorers", () => {
  const goals: StoredGoal[] = [
    storedGoal({ minute: 23, side: "home", player: "Luis Rodriguez", ownGoal: false }),
    storedGoal({ minute: 55, side: "away", player: null, ownGoal: false }),
    storedGoal({ minute: 78, side: "home", player: "Luis Rodriguez", ownGoal: false }),
  ];
  assert.equal(isMatchGoalsInconsistentWithScore(goals, 2, 1), true);
});

run("isMatchGoalsInconsistentWithScore detects missing minutes", () => {
  const goals: StoredGoal[] = [
    storedGoal({ minute: null, side: "away", player: "Salah", ownGoal: false }),
  ];
  assert.equal(isMatchGoalsInconsistentWithScore(goals, 0, 1), true);
});

run("deriveMatchGoalsFromScoreSequence fills minute from period stats when actions lack names", () => {
  const events: TxScoreEvent[] = [
    {
      FixtureId: 18202701,
      Seq: 10,
      Participant1IsHome: true,
      Clock: { Seconds: 58 * 60 },
      Stats: { "1002": 1 },
    },
  ];
  const goals = deriveMatchGoalsFromScoreSequence(events, true, 0, 1);
  assert.equal(goals.length, 1);
  assert.equal(goals[0]?.side, "away");
  assert.equal(goals[0]?.minute, 58);
});

run("isMatchGoalsInconsistentWithScore passes when complete", () => {
  const goals: StoredGoal[] = [
    storedGoal({ minute: 23, side: "home", player: "Luis Rodriguez", ownGoal: false }),
    storedGoal({ minute: 55, side: "away", player: "Mohammed Kudus", ownGoal: false }),
    storedGoal({ minute: 78, side: "home", player: "Luis Rodriguez", ownGoal: false }),
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
  assert.equal(goals[0]?.playerId, 101);
  assert.equal(goals[0]?.clockSeconds, 23 * 60);
  assert.equal(goals[0]?.seq, 10);
  assert.equal(goals[1]?.minute, 55);
  assert.equal(goals[1]?.playerId, 201);
  assert.equal(goals[2]?.minute, 78);
});

run("deriveMatchGoalsFromScoreSequence resolves scorer from penalty_outcome", () => {
  const goals = deriveMatchGoalsFromScoreSequence(MOCK_PENALTY_SEQUENCE, true, 0, 1);
  assert.equal(goals.length, 1);
  assert.equal(goals[0]?.side, "away");
  assert.equal(goals[0]?.minute, 69);
  assert.equal(goals[0]?.player, "Kylian Mbappe Lottin");
  assert.equal(goals[0]?.playerShort, "K. Mbappe");
  assert.equal(goals[0]?.penalty, true);
  assert.equal(goals[0]?.playerId, 453928);
  assert.equal(goals[0]?.clockSeconds, 69 * 60);
  assert.equal(goals[0]?.seq, 693);
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

run("extractGoals drops disallowed period-stat phantom after stat decrease", () => {
  const events: TxScoreEvent[] = [
    {
      FixtureId: 18187298,
      Seq: 1,
      Participant1IsHome: true,
      Stats: { "3002": 1 },
      Clock: { Seconds: 85 * 60 },
    },
    {
      FixtureId: 18187298,
      Seq: 2,
      Participant1IsHome: true,
      Stats: { "3002": 0 },
      Clock: { Seconds: 86 * 60 },
    },
    {
      FixtureId: 18187298,
      Seq: 3,
      Action: "goal",
      Participant: 2,
      Participant1IsHome: true,
      Clock: { Seconds: 89 * 60 },
      Data: { PreferredName: "Haaland, E." },
      Stats: { "3002": 1 },
    },
  ];
  const goals = extractGoals(events);
  assert.equal(goals.length, 1);
  assert.equal(goals[0]?.minute, 89);
  assert.ok(goals[0]?.player);
  assert.equal(goals.filter((goal) => goal.minute === 85).length, 0);
  const derived = deriveMatchGoalsFromScoreSequence(events, true, 0, 1);
  assert.equal(derived.length, 1);
  assert.ok(derived[0]?.player?.includes("Haaland"));
});

run("deriveFirstGoalscorer from mock historical sequence", () => {
  const goals = deriveMatchGoalsFromScoreSequence(MOCK_SEQUENCE, true, 2, 1);
  const first = deriveFirstGoalscorer(goals);
  assert.ok(first);
  assert.equal(first.playerId, 101);
  assert.equal(first.player, "Luis Rodriguez");
  assert.equal(first.clockSeconds, 23 * 60);
  assert.equal(first.seq, 10);
  assert.equal(first.side, "home");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
