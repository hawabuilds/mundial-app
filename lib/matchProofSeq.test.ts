import assert from "node:assert/strict";
import {
  discoverGameFinalisedSeq,
  gameFinalisedEventSeq,
  resolveProofEventSeq,
  resolveProofEventSeqFromSources,
} from "./txScoreEventSeq";
import { terminalScoreEventSeq, type TxScoreEvent } from "./txodds";

console.log("match proof seq tests\n");

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

run("gameFinalisedEventSeq picks latest game_finalised row", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 100, Action: "goal" },
    { FixtureId: 1, Seq: 200, Action: "game_finalised" },
    { FixtureId: 1, Seq: 150, Action: "game_finalised" },
  ];
  assert.equal(gameFinalisedEventSeq(events), 200);
});

run("gameFinalisedEventSeq returns null when absent", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 50, StatusId: 5, Action: "status_change" },
  ];
  assert.equal(gameFinalisedEventSeq(events), null);
});

run("resolveProofEventSeq prefers game_finalised over terminal", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 900, StatusId: 5 },
    { FixtureId: 1, Seq: 1122, Action: "game_finalised", StatusId: 100 },
  ];
  const resolved = resolveProofEventSeq(events);
  assert.equal(resolved.seq, 1122);
  assert.equal(resolved.source, "game_finalised");
  assert.equal(resolved.gameFinalisedFound, true);
});

run("resolveProofEventSeq falls back to terminal StatusId", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 10, StatusId: 4 },
    { FixtureId: 1, Seq: 20, StatusId: 5 },
  ];
  const resolved = resolveProofEventSeq(events);
  assert.equal(resolved.seq, 20);
  assert.equal(resolved.source, "terminal_fallback");
  assert.equal(resolved.gameFinalisedFound, false);
  assert.equal(terminalScoreEventSeq(events), 20);
});

run("resolveProofEventSeq returns null before any terminal row", () => {
  const events: TxScoreEvent[] = [{ FixtureId: 1, Seq: 3, StatusId: 2 }];
  const resolved = resolveProofEventSeq(events);
  assert.equal(resolved.seq, null);
  assert.equal(resolved.source, null);
});

run("discoverGameFinalisedSeq prefers snapshot over historical", () => {
  const snapshot: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 500, Action: "game_finalised" },
  ];
  const historical: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 600, Action: "game_finalised" },
  ];
  const found = discoverGameFinalisedSeq(snapshot, historical);
  assert.deepEqual(found, { seq: 500, foundIn: "snapshot" });
});

run("discoverGameFinalisedSeq falls back to historical when snapshot lacks finalised", () => {
  const snapshot: TxScoreEvent[] = [{ FixtureId: 1, Seq: 959, StatusId: 5 }];
  const historical: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 959, StatusId: 5 },
    { FixtureId: 1, Seq: 960, Action: "game_finalised", StatusId: 100 },
  ];
  const found = discoverGameFinalisedSeq(snapshot, historical);
  assert.deepEqual(found, { seq: 960, foundIn: "historical" });
});

run("resolveProofEventSeqFromSources uses historical game_finalised for upgrade path", () => {
  const snapshot: TxScoreEvent[] = [{ FixtureId: 1, Seq: 959, StatusId: 5 }];
  const historical: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 960, Action: "game_finalised", StatusId: 100 },
  ];
  const resolved = resolveProofEventSeqFromSources(snapshot, historical);
  assert.equal(resolved.seq, 960);
  assert.equal(resolved.source, "game_finalised");
  assert.equal(resolved.gameFinalisedIn, "historical");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
