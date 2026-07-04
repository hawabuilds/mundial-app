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
const id = Number(process.argv[2] || 18175918);
const events = await fetchScoresSnapshot(id);

for (const e of events.filter((x) => x.Action === "action_amend")) {
  console.log("AMEND", e.Seq, JSON.stringify(e.Data)?.slice(0, 500));
}

for (const e of events.filter((x) => x.Action === "goal" || (x.Action === "action_amend" && e.Data))) {
  if (e.Action !== "goal") continue;
}

// All events mentioning PlayerId
const withPlayer = events.filter((e) => e.Data?.PlayerId != null || e.Data?.PreferredName);
console.log("\nEvents with player data:", withPlayer.length);
for (const e of withPlayer.slice(0, 15)) {
  console.log(e.Action, e.Seq, e.Data);
}

// Shot goals?
for (const e of events.filter((x) => x.Action === "shot" && /goal/i.test(JSON.stringify(x.Data ?? {})))) {
  console.log("SHOT", e.Seq, e.Data);
}
