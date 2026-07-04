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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

const { fetchFixturesSnapshot } = await import("../lib/txodds.ts");
const { normalizeStartTimeMs } = await import("../lib/formatKickoff.ts");
const { fetchScoresSnapshot } = await import("../lib/txodds.ts");

const fixtures = await fetchFixturesSnapshot({ fresh: true });
for (const f of fixtures) {
  const home = f.Participant1IsHome ? f.Participant1 : f.Participant2;
  const away = f.Participant1IsHome ? f.Participant2 : f.Participant1;
  console.log({
    id: f.FixtureId,
    home,
    away,
    gs: f.GameState,
    group: f.FixtureGroupId,
    comp: f.Competition,
    start: new Date(normalizeStartTimeMs(f.StartTime)).toISOString(),
  });
}

// Try common devnet fixture ids from prior sessions
const probeIds = [18179549, 18185036, 18187298, 18188721, 18170000, 18175000];
for (const id of probeIds) {
  try {
    const scores = await fetchScoresSnapshot(id);
    if (scores.length > 0) {
      console.log("scores for", id, "events", scores.length, "last status", scores.at(-1)?.StatusId);
    }
  } catch (e) {
    // skip
  }
}
