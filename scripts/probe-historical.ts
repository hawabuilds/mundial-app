import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchMatchWithGoals, mapMatchRow } from "../lib/txMatchSettlement";

async function main() {
  const { match } = await fetchMatchWithGoals({
    id: 18202783,
    home: "Switzerland",
    away: "Colombia",
    date: "2026-07-07",
    time: "20:00",
  });
  const live = match ? mapMatchRow(match) : null;
  console.log("pens", live?.penaltyShootout?.homeScore, live?.penaltyShootout?.awayScore);
  console.log("kicks", live?.penaltyShootout?.kicks.length);
  for (const k of live?.penaltyShootout?.kicks ?? []) {
    console.log(k.teamKick, k.side, k.outcome, k.playerShort ?? k.player);
  }
}

void main();
