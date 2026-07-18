import { config } from "dotenv";
config({ path: ".env.local" });

import { BOARD_MATCH_MAX_MIN } from "@/lib/enrichFixtures";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import { isGameStateInPlay } from "@/lib/txMatchSettlement";
import { fetchFixturesSnapshot } from "@/lib/txodds";

async function main(): Promise<void> {
  const nowMs = Date.now();
  const t0 = Date.now();
  const fixtures = await fetchFixturesSnapshot({ fresh: true });
  console.log("snapshot_ms", Date.now() - t0, "count", fixtures.length);

  const inWindow = fixtures.filter((fx) => {
    if (isGameStateInPlay(fx.GameState)) return true;
    const kickoffMs = normalizeStartTimeMs(fx.StartTime);
    if (kickoffMs > nowMs) return false;
    return nowMs - kickoffMs < BOARD_MATCH_MAX_MIN * 60_000;
  });

  console.log("BOARD_MATCH_MAX_MIN", BOARD_MATCH_MAX_MIN);
  console.log("live_goal_window", inWindow.length);
  console.log(
    "in_play",
    inWindow.filter((f) => isGameStateInPlay(f.GameState)).length,
  );

  const comps = new Map<string, number>();
  for (const fx of inWindow) {
    const c = fx.Competition || "(none)";
    comps.set(c, (comps.get(c) ?? 0) + 1);
  }
  console.log(
    "by_competition",
    [...comps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
  );
  console.log(
    "sample",
    inWindow.slice(0, 20).map((f) => ({
      id: f.FixtureId,
      c: f.Competition,
      p1: f.Participant1,
      p2: f.Participant2,
      gs: f.GameState,
    })),
  );
}

void main();
