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
const events = await fetchScoresSnapshot(18175918);
const latest = latestScoreEvent(events);
const stats = latest?.Stats ?? {};
const keys = Object.keys(stats)
  .map(Number)
  .filter((k) => k > 0 && k < 9000)
  .sort((a, b) => a - b);
console.log("StatusId", latest?.StatusId);
for (const k of keys) {
  if (stats[String(k)] > 0) console.log(k, stats[String(k)]);
}
console.log("Score object", JSON.stringify(latest?.Score, null, 2));
