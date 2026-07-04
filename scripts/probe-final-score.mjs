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

const { fetchScoresSnapshot, latestScoreEvent } = await import("../lib/txodds.ts");
const { fetchMatchWithGoals, mapMatchRow } = await import("../lib/apiFootball.ts");

const events = await fetchScoresSnapshot(18175918);
const latest = latestScoreEvent(events);
console.log("StatusId", latest?.StatusId);
console.log("Action", latest?.Action);
console.log("Score", JSON.stringify(latest?.Score, null, 2));
console.log("Stats 1/2", latest?.Stats?.["1"], latest?.Stats?.["2"]);

const { match } = await fetchMatchWithGoals({
  id: 18175918,
  home: "Argentina",
  away: "Cape Verde",
  date: "2026-07-03",
  time: "22:00",
});
console.log("\nmatch status", match?.status, "minute", match?.minute);
console.log("match score", JSON.stringify(match?.score, null, 2));
console.log("mapped live", JSON.stringify(match ? mapMatchRow(match) : null, null, 2));

for (const e of [...events].sort((a, b) => (b.Seq ?? 0) - (a.Seq ?? 0)).slice(0, 8)) {
  if (e.StatusId === 5 || e.StatusId === 10 || e.StatusId === 13 || e.Action === "status") {
    console.log("\nterminal-ish seq", e.Seq, e.Action, "StatusId", e.StatusId, "Score totals",
      e.Score?.Participant1?.Total?.Goals, e.Score?.Participant2?.Total?.Goals,
      "H2", e.Score?.Participant1?.H2?.Goals, e.Score?.Participant2?.H2?.Goals);
  }
}
