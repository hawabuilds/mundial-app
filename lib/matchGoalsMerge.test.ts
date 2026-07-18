import assert from "node:assert/strict";
import {
  collapseLegacyDuplicateGoals,
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
  playerId: null,
  clockSeconds: null,
  seq: null,
  ownGoal: false,
  penalty: false,
};

function goal(partial: Omit<StoredGoal, never> & Partial<StoredGoal>): StoredGoal {
  return {
    minute: null,
    side: "home",
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

run("collapseLegacyDuplicateGoals drops minute-key shadow when clock row exists", () => {
  const collapsed = collapseLegacyDuplicateGoals([
    goal({
      minute: 69,
      side: "away",
      player: "Kylian Mbappe Lottin",
      playerId: null,
      clockSeconds: null,
      seq: null,
    }),
    goal({
      minute: 69,
      side: "away",
      player: "Kylian Mbappe Lottin",
      playerId: 453928,
      clockSeconds: 4164,
      seq: 693,
      penalty: true,
    }),
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.clockSeconds, 4164);
  assert.equal(collapsed[0]?.playerId, 453928);
});

run("mergeMatchGoals keeps same-minute goals when clock_seconds differ", () => {
  const merged = mergeMatchGoals(
    [
      goal({
        minute: 45,
        side: "home",
        player: "First",
        clockSeconds: 45 * 60 + 10,
        seq: 10,
        playerId: 1,
      }),
      goal({
        minute: 45,
        side: "away",
        player: "Second",
        clockSeconds: 45 * 60 + 40,
        seq: 20,
        playerId: 2,
      }),
    ],
    [],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.player, "First");
  assert.equal(merged[1]?.player, "Second");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
