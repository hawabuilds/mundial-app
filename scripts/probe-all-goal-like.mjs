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

for (const e of sorted) {
  if (e.Action !== "goal" && e.Action !== "action_amend" && e.Action !== "shot") continue;
  const d = e.Data;
  if (e.Action === "action_amend" && d?.Action !== "goal") continue;
  console.log(e.Seq, e.Action, e.Clock?.Seconds, "P", e.Participant, JSON.stringify(d));
}

// possible goals?
for (const e of sorted.filter((x) => x.Action === "possible")) {
  console.log("POSSIBLE", e.Seq, e.Clock?.Seconds, e.Data);
}
