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

let s1 = 0;
let s2 = 0;
for (const e of sorted) {
  const v1 = e.Stats?.["1"];
  const v2 = e.Stats?.["2"];
  if (v1 == null && v2 == null) continue;
  const n1 = v1 ?? s1;
  const n2 = v2 ?? s2;
  if (n1 !== s1 || n2 !== s2) {
    const side = n1 > s1 ? 1 : 2;
    console.log(
      "seq",
      e.Seq,
      e.Action,
      "min",
      e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) : "?",
      "score",
      n1,
      "-",
      n2,
      "scorer side",
      side,
      "P",
      e.Participant,
      "data",
      JSON.stringify(e.Data),
    );
    s1 = n1;
    s2 = n2;
  }
}
