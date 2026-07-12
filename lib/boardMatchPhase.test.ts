import assert from "node:assert/strict";
import { nextStartedKickoffAfterMs } from "./boardMatchPhase";

const englandKickoff = Date.parse("2026-07-11T21:00:00.000Z");
const argentinaKickoff = Date.parse("2026-07-12T01:00:00.000Z");
const nowBeforeArgentina = Date.parse("2026-07-12T00:45:00.000Z");

assert.equal(
  nextStartedKickoffAfterMs(
    englandKickoff,
    [
      { kickoffMs: englandKickoff },
      { kickoffMs: argentinaKickoff },
    ],
    (row) =>
      row.kickoffMs === argentinaKickoff
        ? { gameState: 1, live: null }
        : { gameState: 5, live: { status: "FT" } as never },
  ),
  Number.POSITIVE_INFINITY,
  "scheduled next kickoff does not drop FT card before it starts",
);

assert.equal(
  nextStartedKickoffAfterMs(
    englandKickoff,
    [
      { kickoffMs: englandKickoff },
      { kickoffMs: argentinaKickoff },
    ],
    (row) =>
      row.kickoffMs === argentinaKickoff
        ? { gameState: 2, live: { status: "LIVE" } as never }
        : { gameState: 5, live: { status: "FT" } as never },
  ),
  argentinaKickoff,
  "FT card ends once the next match has kicked off",
);

void nowBeforeArgentina;

console.log("boardMatchPhase.test.ts: ok");
