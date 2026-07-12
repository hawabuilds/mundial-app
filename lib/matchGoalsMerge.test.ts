import assert from "node:assert/strict";
import {
  finalizeMatchGoals,
  fuseSplitGoalRows,
  mergeMatchGoals,
  type StoredGoal,
} from "@/app/lib/supabase";

console.log("matchGoalsMerge tests\n");

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

const bellingham: StoredGoal = {
  minute: null,
  side: "home",
  player: "Jude Bellingham",
  playerShort: "J. Bellingham",
  ownGoal: false,
  penalty: false,
};

run("fuseSplitGoalRows pairs one named row with one timed row", () => {
  const fused = fuseSplitGoalRows([
    bellingham,
    {
      minute: 23,
      side: "home",
      player: null,
      playerShort: null,
      ownGoal: false,
      penalty: false,
    },
  ]);
  assert.equal(fused.length, 1);
  assert.equal(fused[0]?.player, "Jude Bellingham");
  assert.equal(fused[0]?.minute, 23);
});

run("fuseSplitGoalRows applies one scorer amend to multiple timed placeholders", () => {
  const fused = fuseSplitGoalRows([
    bellingham,
    {
      minute: 23,
      side: "home",
      player: null,
      playerShort: null,
      ownGoal: false,
      penalty: false,
    },
    {
      minute: 67,
      side: "home",
      player: null,
      playerShort: null,
      ownGoal: false,
      penalty: false,
    },
  ]);
  assert.equal(fused.length, 2);
  assert.equal(fused[0]?.minute, 23);
  assert.equal(fused[1]?.minute, 67);
  assert.ok(fused.every((goal) => goal.player === "Jude Bellingham"));
});

run("mergeMatchGoals fuses split rows loaded from separate keys", () => {
  const merged = mergeMatchGoals(
    [
      {
        minute: 23,
        side: "home",
        player: null,
        playerShort: null,
        ownGoal: false,
        penalty: false,
      },
      {
        minute: 67,
        side: "home",
        player: null,
        playerShort: null,
        ownGoal: false,
        penalty: false,
      },
    ],
    [bellingham],
  );
  assert.equal(merged.length, 2);
  assert.ok(merged.every((goal) => goal.player === "Jude Bellingham"));
  assert.deepEqual(
    merged.map((goal) => goal.minute),
    [23, 67],
  );
});

run("finalizeMatchGoals prefers complete rows over name-only placeholders", () => {
  const finalized = finalizeMatchGoals(
    fuseSplitGoalRows([
      bellingham,
      {
        minute: 23,
        side: "home",
        player: null,
        playerShort: null,
        ownGoal: false,
        penalty: false,
      },
      {
        minute: 67,
        side: "home",
        player: null,
        playerShort: null,
        ownGoal: false,
        penalty: false,
      },
    ]),
    2,
    0,
  );
  assert.equal(finalized.length, 2);
  assert.ok(finalized.every((goal) => goal.player && goal.minute != null));
});

run("fuseSplitGoalRows keeps own-goal flags separate when pairing", () => {
  const fused = fuseSplitGoalRows([
    {
      minute: null,
      side: "away",
      player: "Own Goal Scorer",
      playerShort: null,
      ownGoal: true,
      penalty: false,
    },
    {
      minute: 44,
      side: "away",
      player: null,
      playerShort: null,
      ownGoal: true,
      penalty: false,
    },
    {
      minute: 55,
      side: "away",
      player: null,
      playerShort: null,
      ownGoal: false,
      penalty: false,
    },
  ]);
  assert.equal(fused.length, 2);
  const og = fused.find((goal) => goal.ownGoal);
  const regular = fused.find((goal) => !goal.ownGoal);
  assert.equal(og?.minute, 44);
  assert.equal(og?.player, "Own Goal Scorer");
  assert.equal(regular?.minute, 55);
  assert.equal(regular?.player, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
