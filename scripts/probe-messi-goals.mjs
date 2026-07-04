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
const events = await fetchScoresSnapshot(18175918);
const lineups = events.find((e) => e.Action === "lineups");
let messiId = null;
for (const team of lineups?.Lineups ?? []) {
  for (const entry of team.lineups ?? []) {
    const name = entry.player?.preferredName ?? "";
    if (/messi/i.test(name)) {
      messiId = entry.player?.normativeId;
      console.log("Messi lineup", entry.player);
    }
  }
}

for (const e of events) {
  if (e.Action !== "goal" && e.Action !== "action_amend") continue;
  const d = e.Data;
  const blob = JSON.stringify(d ?? {});
  if (e.Action === "goal" || d?.Action === "goal") {
    const min = e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) : "?";
    console.log("EVENT", e.Seq, e.Action, "min", min, blob.slice(0, 200));
  }
}

console.log("extractGoals", JSON.stringify(extractGoals(events), null, 2));
