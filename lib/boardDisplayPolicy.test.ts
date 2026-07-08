import { BOARD_RECENT_MAX_AGE_HOURS } from "./boardDisplayPolicy";
import { fixtureDateTime } from "@/app/data/fixtures";
import { WORLD_CUP_2026_FIXTURES } from "@/app/data/worldCup2026Fixtures";
import { pinnedTxFixtureIdsInBoardWindow } from "./pinnedBoardFixtures";

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

console.log("boardDisplayPolicy.test.ts: all assertions passed");
