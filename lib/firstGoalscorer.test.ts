import assert from "node:assert/strict";
import type { StoredGoal } from "@/app/lib/supabase";
import {
  deriveFirstGoalscorer,
  deriveMarketFirstGoalscorer,
  orderGoalsByEventTime,
} from "./firstGoalscorer";

console.log("firstGoalscorer tests\n");

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

const base = (overrides: Partial<StoredGoal>): StoredGoal => ({
  minute: null,
  side: "home",
  player: null,
  playerShort: null,
  ownGoal: false,
  penalty: false,
  playerId: null,
  clockSeconds: null,
  seq: null,
  ...overrides,
});

run("orderGoalsByEventTime sorts by clock_seconds not minute", () => {
  const ordered = orderGoalsByEventTime([
    base({
      minute: 45,
      side: "away",
      player: "Second",
      clockSeconds: 45 * 60 + 30,
      seq: 20,
      playerId: 2,
    }),
    base({
      minute: 45,
      side: "home",
      player: "First",
      clockSeconds: 45 * 60 + 10,
      seq: 10,
      playerId: 1,
    }),
  ]);
  assert.equal(ordered[0]?.player, "First");
  assert.equal(ordered[1]?.player, "Second");
});

run("orderGoalsByEventTime breaks clock ties with seq", () => {
  const ordered = orderGoalsByEventTime([
    base({
      minute: 12,
      player: "Amended",
      clockSeconds: 720,
      seq: 15,
      playerId: 99,
    }),
    base({
      minute: 12,
      player: "Original",
      clockSeconds: 720,
      seq: 10,
      playerId: 99,
    }),
  ]);
  assert.equal(ordered[0]?.seq, 10);
  assert.equal(ordered[1]?.seq, 15);
});

run("deriveFirstGoalscorer prefers PlayerId identity and earliest clock", () => {
  const first = deriveFirstGoalscorer([
    base({
      minute: 55,
      side: "away",
      player: "Kudus",
      playerId: 201,
      clockSeconds: 55 * 60,
      seq: 20,
    }),
    base({
      minute: 23,
      side: "home",
      player: "Rodriguez",
      playerId: 101,
      clockSeconds: 23 * 60,
      seq: 10,
    }),
  ]);
  assert.ok(first);
  assert.equal(first.playerId, 101);
  assert.equal(first.player, "Rodriguez");
  assert.equal(first.clockSeconds, 23 * 60);
  assert.equal(first.seq, 10);
});

run("deriveFirstGoalscorer ignores period-stat placeholders without clock", () => {
  const first = deriveFirstGoalscorer([
    base({ minute: 10, side: "away", player: null }),
    base({
      minute: 35,
      side: "home",
      player: "Bellingham",
      playerId: 9,
      clockSeconds: 35 * 60,
      seq: 5,
    }),
  ]);
  assert.ok(first);
  assert.equal(first.player, "Bellingham");
  assert.equal(first.playerId, 9);
});

run("deriveMarketFirstGoalscorer skips own goal", () => {
  const first = deriveMarketFirstGoalscorer([
    base({
      minute: 10,
      side: "away",
      player: "OG Player",
      playerId: 1,
      clockSeconds: 600,
      seq: 5,
      ownGoal: true,
    }),
    base({
      minute: 20,
      side: "home",
      player: "Real Scorer",
      playerId: 2,
      clockSeconds: 1200,
      seq: 10,
    }),
  ]);
  assert.ok(first);
  assert.equal(first.player, "Real Scorer");
  assert.equal(first.ownGoal, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
