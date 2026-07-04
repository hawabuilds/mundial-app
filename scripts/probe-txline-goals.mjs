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
console.log("actions:", [...new Set(events.map((e) => e.Action))]);
for (const e of events.filter((x) => x.Action === "goal")) {
  console.log("GOAL", JSON.stringify(e, null, 2));
}
for (const e of events.filter((x) => x.Lineups?.length || x.Action === "lineups")) {
  console.log("LINEUPS keys", e.Lineups?.length, "sample player ids:",
    e.Lineups?.[0]?.lineups?.slice(0, 3).map((l) => l.player?.normativeId));
}
console.log("extractGoals:", JSON.stringify(extractGoals(events), null, 2));
