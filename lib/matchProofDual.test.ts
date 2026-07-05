import assert from "node:assert/strict";
import {
  dualProofPopoverIntro,
  proofPopoverCopy,
  PROOF_TERMINAL_FALLBACK_FOOTNOTE,
} from "./txScoreProofSemantics";

console.log("match proof dual tests\n");

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

run("dualProofPopoverIntro is a single line without section duplication", () => {
  const intro = dualProofPopoverIntro();
  assert.ok(intro.includes("TxLINE"));
  assert.ok(!intro.includes("Official result"));
  assert.ok(!intro.includes("Regulation score"));
  assert.ok(!intro.includes("terminal StatusId"));
});

run("proofPopoverCopy provides one-line section descriptions", () => {
  assert.ok(proofPopoverCopy("total").includes("Full-time"));
  assert.ok(proofPopoverCopy("regulation").includes("90-minute"));
});

run("terminal fallback footnote is plain English once", () => {
  assert.ok(PROOF_TERMINAL_FALLBACK_FOOTNOTE.includes("final whistle"));
  assert.ok(!PROOF_TERMINAL_FALLBACK_FOOTNOTE.includes("terminal StatusId"));
});

run("dual persistence shape keeps regulation as badge source", () => {
  const row = {
    official_payload: { ts: 1 },
    regulation_payload: { ts: 2 },
    official_seq: 1122,
    regulation_seq: 1122,
    official_stat_keys: "1,2",
    regulation_stat_keys: "1001,1002,3001,3002",
    seq_source: "game_finalised",
    proof_mode: "regulation",
    show_verified_badge: true,
  };
  assert.equal(row.proof_mode, "regulation");
  assert.equal(row.regulation_stat_keys.split(",").length, 4);
  assert.equal(row.official_stat_keys, "1,2");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
