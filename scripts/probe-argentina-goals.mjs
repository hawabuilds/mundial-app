import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
for (const name of [".env.local", ".env.production.local"]) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

const { fetchScoresSnapshot, extractGoals } = await import("../lib/txodds.ts");
const id = Number(process.argv[2] || 18175918);
const events = await fetchScoresSnapshot(id);

const goals = events.filter((x) => x.Action === "goal");
console.log("goal events count:", goals.length);
for (const e of goals) {
  console.log("--- goal seq", e.Seq, "min", e.Clock?.Seconds, "P", e.Participant, "Data", e.Data);
}

const amends = events.filter((x) => x.Action === "action_amend" && /goal/i.test(JSON.stringify(x.Data ?? {})));
console.log("goal amends:", amends.length);

const lineups = events.find((x) => x.Action === "lineups");
console.log("lineups event:", lineups ? "yes" : "no", "teams", lineups?.Lineups?.length);

console.log("extractGoals:", JSON.stringify(extractGoals(events), null, 2));

const { getTxScheduleBoard } = await import("../lib/txScheduleBoard.ts");
const board = await getTxScheduleBoard();
const arg = board.find((r) => r.id === id);
console.log("board goals:", JSON.stringify(arg?.goals, null, 2));
console.log("board score:", arg?.live?.homeScore, arg?.live?.awayScore);
