import { getTxScheduleBoard } from "../lib/txScheduleBoard.ts";

const board = await getTxScheduleBoard();
const summary = board.map((r) => ({
  id: r.id,
  home: r.home,
  away: r.away,
  phase: r.phase,
  status: r.live?.status ?? null,
  score:
    r.live?.homeScore != null
      ? `${r.live.homeScore}-${r.live.awayScore}`
      : null,
}));
console.log(JSON.stringify(summary, null, 2));
const arg = board.find(
  (r) => r.home === "Argentina" || r.away === "Argentina",
);
console.log("\nArgentina row:", arg ? "FOUND" : "MISSING");
