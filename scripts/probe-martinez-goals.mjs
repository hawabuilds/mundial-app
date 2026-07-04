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
const lineups = events.find((e) => e.Action === "lineups");

console.log("=== Argentina players matching martinez/messi ===");
for (const team of lineups?.Lineups ?? []) {
  if (!/argentina/i.test(team.preferredName ?? "")) continue;
  for (const entry of team.lineups ?? []) {
    const name = entry.player?.preferredName ?? "";
    if (/martinez|messi|martínez/i.test(name)) {
      console.log(entry.player?.normativeId, name);
    }
  }
}

console.log("\n=== All goal + amend events ===");
for (const e of [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0))) {
  if (e.Action === "goal") {
    console.log("GOAL", e.Seq, "min", e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) : "?", "P", e.Participant, JSON.stringify(e.Data));
  }
  if (e.Action === "action_amend" && e.Data?.Action === "goal") {
    console.log("AMEND", e.Seq, JSON.stringify(e.Data));
  }
}

console.log("\n=== Stats goal progression ===");
let s1 = 0, s2 = 0;
for (const e of [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0))) {
  const v1 = e.Stats?.["1"];
  const v2 = e.Stats?.["2"];
  if (v1 == null && v2 == null) continue;
  const n1 = v1 ?? s1;
  const n2 = v2 ?? s2;
  if (n1 !== s1 || n2 !== s2) {
    console.log("seq", e.Seq, e.Action, "min", e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) : "?", `${s1}-${s2} -> ${n1}-${n2}`);
    s1 = n1; s2 = n2;
  }
}
