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

const { fetchScoresSnapshot } = await import("../lib/txodds.ts");
const events = await fetchScoresSnapshot(18175918);

for (const e of events.filter((x) => x.Action === "action_discarded")) {
  console.log("DISCARDED", e.Seq, JSON.stringify(e.Data)?.slice(0, 800));
}

for (const e of events.filter((x) => x.Action === "goal")) {
  console.log("GOAL FULL", JSON.stringify(e, null, 2).slice(0, 1500));
}

// Events with Stats key 1 or 2 (total goals per participant from txodds comment)
const withStats = events.filter((e) => e.Stats?.["1"] != null || e.Stats?.["2"] != null);
console.log("events with stats 1/2:", withStats.length);
for (const e of withStats.slice(-5)) {
  console.log("stats", e.Seq, e.Action, e.Stats?.["1"], e.Stats?.["2"], e.Clock?.Seconds);
}
