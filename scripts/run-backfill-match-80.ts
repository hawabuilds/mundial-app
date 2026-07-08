import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", override: false });

import { getMatchGoals, getMatchState, isMatchScored } from "../app/lib/supabase";
import {
  backfillMatchGoals,
  backfillMatchGoalsByTxFixture,
} from "../lib/backfillMatchGoals";
import { fetchScoresSnapshot, latestScoreEvent } from "../lib/txodds";

const MATCH_ID = 80;
const TX_ID = 18202701;

function formatRows(
  rows: {
    minute: number | null;
    side: string;
    player: string | null;
  }[],
): string {
  if (!rows.length) return "  (none)";
  return rows
    .map((g) => `  ${g.side} ${g.minute ?? "?"}' ${g.player ?? "(blank)"}`)
    .join("\n");
}

function regulationFromSnapshot(events: Awaited<ReturnType<typeof fetchScoresSnapshot>>) {
  const last = latestScoreEvent(events);
  const s = last?.Stats;
  if (!s) return null;
  return {
    home: (s["1001"] ?? 0) + (s["3001"] ?? 0),
    away: (s["1002"] ?? 0) + (s["3002"] ?? 0),
    statusId: last?.StatusId,
  };
}

async function main() {
  console.log("Supabase connection test…");
  const state = await getMatchState(MATCH_ID);
  console.log("match_state:", state);
  console.log("scored:", await isMatchScored(MATCH_ID));
  const before = await getMatchGoals(TX_ID);
  console.log("match_goals before:\n" + formatRows(before));

  const snap = await fetchScoresSnapshot(TX_ID);
  const reg = regulationFromSnapshot(snap);
  console.log("TxLINE regulation score:", reg);

  if (await isMatchScored(MATCH_ID)) {
    console.log("\nRunning backfillMatchGoals(80)…");
    const result = await backfillMatchGoals(MATCH_ID);
    console.log("status:", result.status);
    if (result.status === "error") console.log("error:", result.error);
    if ("before" in result) {
      console.log("before:\n" + formatRows(result.before));
      console.log("after:\n" + formatRows(result.after));
    }
    return;
  }

  if (!reg) {
    console.log("No regulation score from TxLINE — cannot tx backfill");
    return;
  }

  console.log(
    `\nMatch not settled — running tx backfill ${reg.home}-${reg.away}…`,
  );
  const txResult = await backfillMatchGoalsByTxFixture({
    txFixtureId: TX_ID,
    homeScore: reg.home,
    awayScore: reg.away,
    matchId: MATCH_ID,
  });
  console.log("status:", txResult.status);
  if (txResult.status === "error") console.log("error:", txResult.error);
  if ("before" in txResult) {
    console.log("before:\n" + formatRows(txResult.before));
    console.log("after:\n" + formatRows(txResult.after));
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
