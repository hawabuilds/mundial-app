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

const keys = ["1", "2", "2002", "3002", "4001", "4002", "7001", "7002"];
const prev = {};
for (const e of sorted) {
  for (const k of keys) {
    const v = e.Stats?.[k];
    if (v == null) continue;
    if (prev[k] !== v) {
      console.log(
        "seq",
        e.Seq,
        e.Action,
        "k",
        k,
        prev[k] ?? 0,
        "->",
        v,
        "min",
        e.Clock?.Seconds != null ? Math.floor(e.Clock.Seconds / 60) : "?",
        "P",
        e.Participant,
        JSON.stringify(e.Data)?.slice(0, 120),
      );
      prev[k] = v;
    }
  }
}
