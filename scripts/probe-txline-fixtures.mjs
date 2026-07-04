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

const { fetchFixturesSnapshot, isTxoddsConfigured } = await import("../lib/txodds.ts");

if (!isTxoddsConfigured()) {
  console.error("TXODDS_API_TOKEN not set");
  process.exit(1);
}

const fixtures = await fetchFixturesSnapshot({ fresh: true });
const byGroup = new Map();
for (const f of fixtures) {
  const key = `${f.FixtureGroupId}|${f.Competition}`;
  if (!byGroup.has(key)) byGroup.set(key, []);
  byGroup.get(key).push(f);
}

for (const [key, list] of [...byGroup.entries()].sort()) {
  console.log("\n===", key, `(${list.length} fixtures) ===`);
  for (const f of list.slice(0, 3)) {
    console.log({
      id: f.FixtureId,
      home: f.Participant1IsHome ? f.Participant1 : f.Participant2,
      away: f.Participant1IsHome ? f.Participant2 : f.Participant1,
      gs: f.GameState,
      start: new Date(f.StartTime).toISOString(),
    });
  }
}
