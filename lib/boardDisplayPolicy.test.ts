import { BOARD_RECENT_MAX_AGE_HOURS } from "./boardDisplayPolicy";
import { fixtureDateTime } from "@/app/data/fixtures";
import { WORLD_CUP_2026_FIXTURES } from "@/app/data/worldCup2026Fixtures";
import { pinnedTxFixtureIdsInBoardWindow } from "./pinnedBoardFixtures";
import type { TxFixture } from "./txodds";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const now = Date.parse("2026-07-07T23:41:00.000Z");
const pinned = pinnedTxFixtureIdsInBoardWindow(now);
assert(pinned.includes(18202783), "Switzerland vs Colombia stays pinned in board window");
assert(pinned.length > 0, "board window includes recent registry matches");

const kickoff = fixtureDateTime(
  WORLD_CUP_2026_FIXTURES.find((f) => f.externalFixtureId === 18202783)!,
).getTime();
const recentMs = BOARD_RECENT_MAX_AGE_HOURS * 3_600_000;
assert(now - kickoff < recentMs, "fixture still inside 8h window");

const qfSnapshot: TxFixture = {
  Ts: 0,
  StartTime: Date.parse("2026-07-15T21:00:00.000Z"),
  Competition: "FIFA World Cup",
  CompetitionId: 0,
  FixtureGroupId: 1,
  Participant1Id: 0,
  Participant1: "England",
  Participant2Id: 0,
  Participant2: "Norway",
  FixtureId: 19990001,
  Participant1IsHome: true,
  GameState: 5,
};
const withSnapshot = pinnedTxFixtureIdsInBoardWindow(now, [qfSnapshot]);
assert(
  !withSnapshot.includes(19990001),
  "QF outside 96h lookahead is not pinned at R32 time",
);

console.log("boardDisplayPolicy.test.ts: all assertions passed");
