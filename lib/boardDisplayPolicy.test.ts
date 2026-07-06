import assert from "node:assert/strict";
import {
  BOARD_MAX_UPCOMING,
  BOARD_RECENT_MAX_AGE_HOURS,
  BOARD_UPCOMING_LOOKAHEAD_HOURS,
  capBoardForDisplay,
  shouldIncludeRowOnBoard,
} from "./boardDisplayPolicy";

const H = 3_600_000;
const now = Date.parse("2026-07-06T01:00:00Z");

console.log("boardDisplayPolicy tests\n");

assert.equal(
  shouldIncludeRowOnBoard(
    { kickoffMs: now + 12 * H, fx: { FixtureId: 1, GameState: 1 } },
    now,
  ),
  true,
  "in-play always shown",
);

assert.equal(
  shouldIncludeRowOnBoard(
    { kickoffMs: now - 2 * H, fx: { FixtureId: 2, GameState: 5 } },
    now,
  ),
  true,
  "recent FT within max age",
);

assert.equal(
  shouldIncludeRowOnBoard(
    { kickoffMs: now - (BOARD_RECENT_MAX_AGE_HOURS + 1) * H, fx: { FixtureId: 3, GameState: 5 } },
    now,
  ),
  false,
  "old FT dropped",
);

assert.equal(
  shouldIncludeRowOnBoard(
    { kickoffMs: now + (BOARD_UPCOMING_LOOKAHEAD_HOURS + 6) * H, fx: { FixtureId: 4 } },
    now,
  ),
  false,
  "far-future upcoming hidden",
);

assert.equal(
  shouldIncludeRowOnBoard(
    { kickoffMs: now - 5 * H, fx: { FixtureId: 5 } },
    now,
  ),
  false,
  "stale not-started (past kickoff, no GameState) dropped",
);

const capped = capBoardForDisplay([
  { phase: "recent", kickoffUtcMs: 1, txFixtureId: 10 },
  { phase: "recent", kickoffUtcMs: 2, txFixtureId: 11 },
  ...Array.from({ length: 12 }, (_, i) => ({
    phase: "upcoming" as const,
    kickoffUtcMs: 100 + i,
    txFixtureId: 20 + i,
  })),
  { phase: "live", kickoffUtcMs: 50, txFixtureId: 16 },
]);

assert.equal(capped.filter((r) => r.phase === "recent").length, 1);
assert.equal(capped.filter((r) => r.phase === "upcoming").length, BOARD_MAX_UPCOMING);
assert.equal(capped.filter((r) => r.phase === "live").length, 1);
assert.equal(capped.length, 1 + 1 + BOARD_MAX_UPCOMING);

console.log("boardDisplayPolicy tests: ok");
