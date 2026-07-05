import assert from "node:assert/strict";
import {
  formatPlayerFullName,
  formatPlayerShortName,
  goalScorerDisplayName,
  shortNameFromFull,
} from "./playerDisplayName";

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

console.log("playerDisplayName tests\n");

run("formatPlayerShortName handles compound TxLINE surname", () => {
  assert.equal(
    formatPlayerShortName("Mbappe Lottin, Kylian"),
    "K. Mbappe",
  );
});

run("formatPlayerShortName uses mononym for particle-led Brazilian names", () => {
  assert.equal(
    formatPlayerShortName("da Silva Santos Junior, Neymar"),
    "Neymar",
  );
});

run("goalScorerDisplayName prefers playerShort", () => {
  assert.equal(
    goalScorerDisplayName({
      player: "Neymar da Silva Santos Junior",
      playerShort: "Neymar",
    }),
    "Neymar",
  );
});

run("formatPlayerShortName handles single surname", () => {
  assert.equal(formatPlayerShortName("Rodriguez, Luis"), "L. Rodriguez");
  assert.equal(formatPlayerShortName("Kudus, Mohammed"), "M. Kudus");
});

run("formatPlayerFullName reverses comma form", () => {
  assert.equal(formatPlayerFullName("Mbappe Lottin, Kylian"), "Kylian Mbappe Lottin");
});

run("shortNameFromFull uses last token as fallback", () => {
  assert.equal(shortNameFromFull("Lionel Messi"), "L. Messi");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
