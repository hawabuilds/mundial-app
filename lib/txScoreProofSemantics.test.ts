import assert from "node:assert/strict";
import {
  evaluateProofSemantics,
  participantTotalsFromStats,
  PROOF_TERMINAL_FALLBACK_FOOTNOTE,
  REGULATION_GOAL_STAT_KEYS,
  statValueForTotal,
  TOTAL_GOAL_STAT_KEYS,
} from "./txScoreProofSemantics";
import type { TxScoreStat } from "./txScoreStat";

console.log("tx score proof semantics tests\n");

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

run("statValueForTotal accepts period 100 (aggregate total)", () => {
  const stats: TxScoreStat[] = [
    { key: 1, value: 2, period: 100 },
    { key: 2, value: 0, period: 100 },
  ];
  assert.equal(statValueForTotal(stats, 1), 2);
  assert.equal(statValueForTotal(stats, 2), 0);
});

run("statValueForTotal accepts period 5 (FT segment at terminal seq)", () => {
  const stats: TxScoreStat[] = [
    { key: 1, value: 2, period: 5 },
    { key: 2, value: 0, period: 5 },
  ];
  assert.equal(statValueForTotal(stats, 1), 2);
  assert.equal(statValueForTotal(stats, 2), 0);
});

run("statValueForTotal ignores non-total period encoding", () => {
  const stats: TxScoreStat[] = [
    { key: 1, value: 99, period: 1000 },
    { key: 2, value: 88, period: 3000 },
  ];
  assert.equal(statValueForTotal(stats, 1), null);
  assert.equal(statValueForTotal(stats, 2), null);
});

run("participantTotalsFromStats regulation sums composite keys regardless of period field", () => {
  const stats: TxScoreStat[] = [
    { key: REGULATION_GOAL_STAT_KEYS[0], value: 1, period: 1000 },
    { key: REGULATION_GOAL_STAT_KEYS[1], value: 0, period: 1000 },
    { key: REGULATION_GOAL_STAT_KEYS[2], value: 1, period: 3000 },
    { key: REGULATION_GOAL_STAT_KEYS[3], value: 0, period: 3000 },
  ];
  assert.deepEqual(participantTotalsFromStats(stats, "regulation"), { p1: 2, p2: 0 });
});

run("evaluateProofSemantics regulation matches settled score (period on composite keys ignored)", () => {
  const stats: TxScoreStat[] = [
    { key: 1001, value: 1, period: 1000 },
    { key: 1002, value: 0, period: 1000 },
    { key: 3001, value: 1, period: 3000 },
    { key: 3002, value: 0, period: 3000 },
  ];
  const result = evaluateProofSemantics({
    stats,
    statKeys: [...REGULATION_GOAL_STAT_KEYS],
    settledHome: 2,
    settledAway: 0,
    homeIsP1: true,
    terminalStatusId: 5,
  });
  assert.equal(result.semanticsMismatch, false);
  assert.equal(result.showVerifiedBadge, true);
  assert.equal(result.provenHome, 2);
  assert.equal(result.provenAway, 0);
});

run("evaluateProofSemantics official total with period 5 matches settled score", () => {
  const stats: TxScoreStat[] = [
    { key: 1, value: 2, period: 5 },
    { key: 2, value: 0, period: 5 },
  ];
  const result = evaluateProofSemantics({
    stats,
    statKeys: [...TOTAL_GOAL_STAT_KEYS],
    settledHome: 2,
    settledAway: 0,
    homeIsP1: true,
    terminalStatusId: 5,
  });
  assert.equal(result.semanticsMismatch, false);
  assert.equal(result.showVerifiedBadge, true);
});

run("evaluateProofSemantics official total with period 100 matches settled score", () => {
  const stats: TxScoreStat[] = [
    { key: 1, value: 2, period: 100 },
    { key: 2, value: 0, period: 100 },
  ];
  const result = evaluateProofSemantics({
    stats,
    statKeys: [...TOTAL_GOAL_STAT_KEYS],
    settledHome: 2,
    settledAway: 0,
    homeIsP1: true,
    terminalStatusId: 5,
  });
  assert.equal(result.semanticsMismatch, false);
  assert.equal(result.showVerifiedBadge, true);
});

run("terminal fallback footnote is plain English", () => {
  assert.ok(PROOF_TERMINAL_FALLBACK_FOOTNOTE.includes("final whistle"));
  assert.ok(!PROOF_TERMINAL_FALLBACK_FOOTNOTE.includes("StatusId"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
