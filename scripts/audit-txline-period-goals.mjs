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
const sorted = [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));

const periodStatKeys = [
  1001, 1002, 3001, 3002, 4001, 4002, 5001, 5002, 7001, 7002,
];

console.log("=== Period stat progression ===");
const prev = {};
for (const e of sorted) {
  for (const k of periodStatKeys) {
    const v = e.Stats?.[String(k)];
    if (v == null) continue;
    const pk = String(k);
    if (prev[pk] !== v) {
      console.log(
        "seq", e.Seq, e.Action, "StatusId", e.StatusId,
        "clock", e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) + "'" : "?",
        `stat[${k}]`, prev[pk] ?? 0, "->", v,
        e.Data?.PlayerId ? `PlayerId ${e.Data.PlayerId}` : "",
      );
      prev[pk] = v;
    }
  }
}

console.log("\n=== Events with PlayerId in Data ===");
for (const e of sorted) {
  const pid = e.Data?.PlayerId;
  if (pid == null) continue;
  console.log(
    e.Seq, e.Action,
    "clock", e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) + "'" : "?",
    "P", e.Participant, "PlayerId", pid,
  );
}

console.log("\n=== possible / shot goal hints ===");
for (const e of sorted) {
  if (e.Action === "possible" && e.Data?.Goal) {
    console.log("POSSIBLE GOAL", e.Seq, e.Clock?.Seconds, e.Data);
  }
  if (e.Action === "shot" && /goal/i.test(JSON.stringify(e.Data ?? {}))) {
    console.log("SHOT", e.Seq, e.Clock?.Seconds, e.Data);
  }
}
