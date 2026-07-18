import assert from "node:assert/strict";
import {
  extractLineupPlayersFromEvents,
  type LineupPlayer,
} from "./matchLineups";
import type { TxScoreEvent } from "./txodds";

console.log("matchLineups tests\n");

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

const lineupEvent = (overrides: Partial<TxScoreEvent> = {}): TxScoreEvent => ({
  Action: "lineups",
  Seq: 1,
  Lineups: [
    {
      preferredName: "England",
      lineups: [
        { player: { normativeId: 101, preferredName: "Kane, Harry" } },
        { player: { normativeId: 102, preferredName: "Saka, Bukayo" } },
      ],
    },
    {
      preferredName: "France",
      lineups: [
        { player: { normativeId: 201, preferredName: "Mbappe, Kylian" } },
      ],
    },
  ],
  ...overrides,
});

run("extractLineupPlayersFromEvents maps homeIsP1=true", () => {
  const players = extractLineupPlayersFromEvents([lineupEvent()], true);
  assert.equal(players.length, 3);
  const kane = players.find((p) => p.playerId === 101);
  assert.ok(kane);
  assert.equal(kane.side, "home");
  assert.equal(kane.name, "Harry Kane");
  const mbappe = players.find((p) => p.playerId === 201);
  assert.ok(mbappe);
  assert.equal(mbappe.side, "away");
});

run("extractLineupPlayersFromEvents swaps sides when homeIsP1=false", () => {
  const players = extractLineupPlayersFromEvents([lineupEvent()], false);
  const kane = players.find((p) => p.playerId === 101);
  assert.ok(kane);
  assert.equal(kane.side, "away");
});

run("extractLineupPlayersFromEvents uses latest lineup event", () => {
  const older = lineupEvent({ Seq: 1 });
  const newer = lineupEvent({
    Seq: 2,
    Lineups: [
      {
        preferredName: "England",
        lineups: [
          { player: { normativeId: 103, preferredName: "Bellingham, Jude" } },
        ],
      },
      { preferredName: "France", lineups: [] },
    ],
  });
  const players = extractLineupPlayersFromEvents([older, newer], true);
  assert.equal(players.length, 1);
  assert.equal(players[0]?.playerId, 103);
});

run("extractLineupPlayersFromEvents dedupes by playerId", () => {
  const dup = lineupEvent({
    Lineups: [
      {
        preferredName: "England",
        lineups: [
          { player: { normativeId: 101, preferredName: "Kane, Harry" } },
          { player: { normativeId: 101, preferredName: "Kane, Harry" } },
        ],
      },
      { preferredName: "France", lineups: [] },
    ],
  });
  const players = extractLineupPlayersFromEvents([dup], true);
  assert.equal(players.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
