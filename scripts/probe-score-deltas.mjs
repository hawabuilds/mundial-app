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

let p1 = 0;
let p2 = 0;
for (const e of sorted) {
  const t1 = e.Score?.Participant1?.Total?.Goals;
  const t2 = e.Score?.Participant2?.Total?.Goals;
  if (t1 == null && t2 == null) continue;
  if (t1 !== p1 || t2 !== p2) {
    console.log("seq", e.Seq, "action", e.Action, "clock", e.Clock?.Seconds, "score", t1, "-", t2, "P", e.Participant, "data", e.Data);
    p1 = t1 ?? p1;
    p2 = t2 ?? p2;
  }
}
