import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchMatchWithGoals, mapMatchRow } from "../lib/txMatchSettlement";
import { getTxScheduleBoard } from "../lib/txScheduleBoard";

async function main() {
  const lookup = {
    id: 18202783,
    home: "Switzerland",
    away: "Colombia",
    date: "2026-07-07",
    time: "20:00",
  };

  const { match } = await fetchMatchWithGoals(lookup);
  const live = match ? mapMatchRow(match) : null;
  console.log("match", match?.status, match?.score);
  console.log("pens", match?.penaltyShootout);
  console.log("live", live);

  const board = await getTxScheduleBoard();
  const row = board.find((r) => r.txFixtureId === 18202783);
  console.log("board live", row?.live);
  console.log("terminal", row?.terminalStatusId);
}

void main();
