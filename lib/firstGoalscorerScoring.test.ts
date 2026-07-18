import assert from "node:assert/strict";
import type { FirstGoalscorerPredictionRow } from "@/app/lib/firstGoalscorerPredictions";
import type { StoredGoal } from "@/app/lib/supabase";
import { SCORER_BACKFILL_MAX_AGE_MS } from "@/lib/backfillMatchGoals";
import { derivePersistableMatchGoalsFromScoreSequence } from "@/lib/backfillMatchGoals";
import type { TxScoreEvent } from "@/lib/txodds";
import {
  decideFirstGoalscorerBonus,
  isFirstGoalscorerPredictionCorrect,
  planFirstGoalscorerSettlement,
  shouldWaitForFirstGoalscorerSettlement,
} from "@/lib/firstGoalscorerScoring";
import { assessGoalDataCompleteness } from "@/lib/firstGoalscorerCompleteness";

/** Colombia 2-1 Ghana — match id 73, TxLINE 18179549 (COMPLETE). */
const COMPLETE_SEQUENCE: TxScoreEvent[] = [
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

function pick(
  partial: Partial<FirstGoalscorerPredictionRow> &
    Pick<FirstGoalscorerPredictionRow, "user_id" | "player_id" | "player_name" | "player_side">,
): FirstGoalscorerPredictionRow {
  return {
    match_id: 73,
    user_handle: "test",
    predicted_at: "2026-07-18T00:00:00.000Z",
    ...partial,
  };
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

console.log("firstGoalscorerScoring tests\n");

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

const completeGoals = derivePersistableMatchGoalsFromScoreSequence(
  COMPLETE_SEQUENCE,
  true,
  2,
  1,
);

run("Colombia 2-1 goal data is COMPLETE and settleable", () => {
  const assessment = assessGoalDataCompleteness(completeGoals, 2, 1);
  assert.equal(assessment.status, "complete");
  assert.equal(assessment.settleableForFirstScorer, true);
  assert.equal(assessment.firstGoalscorer?.playerId, 101);
});

run("correct first goalscorer pick doubles scoreline points (match 73)", () => {
  const assessment = assessGoalDataCompleteness(completeGoals, 2, 1);
  const rodriguez = pick({
    user_id: "1",
    player_id: 101,
    player_name: "Luis Rodriguez",
    player_side: "home",
  });
  const decision = decideFirstGoalscorerBonus(rodriguez, assessment, 5);
  assert.equal(decision.outcome, "doubled");
  assert.equal(decision.bonusPoints, 5);
  assert.equal(decision.finalPoints, 10);
});

run("wrong first goalscorer keeps base points (match 73)", () => {
  const assessment = assessGoalDataCompleteness(completeGoals, 2, 1);
  const kudus = pick({
    user_id: "2",
    player_id: 201,
    player_name: "Mohammed Kudus",
    player_side: "away",
  });
  const decision = decideFirstGoalscorerBonus(kudus, assessment, 3);
  assert.equal(decision.outcome, "no_bonus");
  assert.equal(decision.bonusPoints, 0);
  assert.equal(decision.finalPoints, 3);
});

run("0-0 match applies no bonus", () => {
  const assessment = assessGoalDataCompleteness([], 0, 0);
  const anyPick = pick({
    user_id: "3",
    player_id: 101,
    player_name: "Anyone",
    player_side: "home",
  });
  const decision = decideFirstGoalscorerBonus(anyPick, assessment, 5);
  assert.equal(decision.outcome, "no_bonus");
  assert.equal(decision.finalPoints, 5);
});

/** Argentina vs Egypt style — scorer row without play-by-play clock (INCOMPLETE). */
const incompleteGoals = [
  goal({
    side: "home",
    minute: 58,
    player: null,
    clockSeconds: null,
    seq: 5,
  }),
];

run("INCOMPLETE goal data voids bonus and keeps base points", () => {
  const assessment = assessGoalDataCompleteness(incompleteGoals, 1, 0);
  assert.equal(assessment.settleableForFirstScorer, false);
  const anyPick = pick({
    user_id: "4",
    player_id: 999,
    player_name: "Someone",
    player_side: "home",
  });
  const decision = decideFirstGoalscorerBonus(anyPick, assessment, 5);
  assert.equal(decision.outcome, "void");
  assert.equal(decision.bonusPoints, 0);
  assert.equal(decision.finalPoints, 5);
});

run("incomplete data waits inside backfill window", () => {
  const assessment = assessGoalDataCompleteness(incompleteGoals, 1, 0);
  const now = Date.parse("2026-07-18T22:00:00.000Z");
  const scoredAt = now - 60 * 60 * 1000;
  assert.equal(
    shouldWaitForFirstGoalscorerSettlement(assessment, scoredAt, now),
    true,
  );
});

run("incomplete data settles (void) after backfill window expires", () => {
  const assessment = assessGoalDataCompleteness(incompleteGoals, 1, 0);
  const now = Date.parse("2026-07-20T22:00:00.000Z");
  const scoredAt = now - SCORER_BACKFILL_MAX_AGE_MS - 1;
  assert.equal(
    shouldWaitForFirstGoalscorerSettlement(assessment, scoredAt, now),
    false,
  );

  const plan = planFirstGoalscorerSettlement({
    goals: incompleteGoals,
    homeScore: 1,
    awayScore: 0,
    picks: [
      pick({
        user_id: "5",
        player_id: 101,
        player_name: "Player",
        player_side: "home",
      }),
    ],
    predictionsByUserId: new Map([["5", { points: 3 }]]),
    scoredAtMs: scoredAt,
    nowMs: now,
  });
  assert.equal(plan.action, "settle");
  assert.equal(plan.decisions.get("5")?.outcome, "void");
  assert.equal(plan.decisions.get("5")?.finalPoints, 3);
});

run("COMPLETE match settlement plan doubles correct pick only", () => {
  const plan = planFirstGoalscorerSettlement({
    goals: completeGoals,
    homeScore: 2,
    awayScore: 1,
    picks: [
      pick({
        user_id: "10",
        player_id: 101,
        player_name: "Luis Rodriguez",
        player_side: "home",
      }),
      pick({
        user_id: "11",
        player_id: 201,
        player_name: "Mohammed Kudus",
        player_side: "away",
      }),
    ],
    predictionsByUserId: new Map([
      ["10", { points: 5, score_base: 5, score_multiplier: 1 }],
      ["11", { points: 3, score_base: 3, score_multiplier: 1 }],
    ]),
    scoredAtMs: Date.parse("2026-07-18T22:00:00.000Z"),
  });

  assert.equal(plan.action, "settle");
  assert.equal(plan.decisions.get("10")?.outcome, "doubled");
  assert.equal(plan.decisions.get("10")?.finalPoints, 10);
  assert.equal(plan.decisions.get("11")?.outcome, "no_bonus");
  assert.equal(plan.decisions.get("11")?.finalPoints, 3);
});

run("PlayerId match is authoritative", () => {
  const assessment = assessGoalDataCompleteness(completeGoals, 2, 1);
  const market = assessment.firstGoalscorer!;
  assert.ok(
    isFirstGoalscorerPredictionCorrect(
      pick({
        user_id: "12",
        player_id: 101,
        player_name: "Different spelling",
        player_side: "home",
      }),
      market,
    ),
  );
});

run("re-applying the same settlement plan is stable (idempotent inputs)", () => {
  const input = {
    goals: completeGoals,
    homeScore: 2,
    awayScore: 1,
    picks: [
      pick({
        user_id: "10",
        player_id: 101,
        player_name: "Luis Rodriguez",
        player_side: "home",
      }),
    ],
    predictionsByUserId: new Map([["10", { points: 5 }]]),
    scoredAtMs: Date.parse("2026-07-18T22:00:00.000Z"),
  };
  const first = planFirstGoalscorerSettlement(input);
  const second = planFirstGoalscorerSettlement(input);
  assert.deepEqual(first.decisions.get("10"), second.decisions.get("10"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
