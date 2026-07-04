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
const lineups = events.find((x) => x.Action === "lineups");
const targetId = 1055356;

for (const team of lineups?.Lineups ?? []) {
  console.log("team", team.preferredName);
  for (const entry of team.lineups ?? []) {
    const p = entry.player;
    if (!p) continue;
    const ids = [p.normativeId, p.id, p.playerId, p.PlayerId].filter(Boolean);
    if (ids.some((id) => id === targetId)) {
      console.log("MATCH", p);
    }
  }
}

// dump a sample player object keys
const sample = lineups?.Lineups?.[0]?.lineups?.[0]?.player;
console.log("player keys", sample ? Object.keys(sample) : null, sample);

// all amends for goals
for (const e of events.filter((x) => x.Action === "action_amend")) {
  const d = e.Data;
  if (d?.Action === "goal" || d?.New) console.log(JSON.stringify(d));
}
