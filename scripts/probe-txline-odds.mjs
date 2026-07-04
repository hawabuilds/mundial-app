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

const { fetchOddsSnapshot, parse1x2FullTime } = await import("../lib/txodds.ts");
const { ensureMatchOddsLocked } = await import("../lib/ensureMatchOdds.ts");

for (const id of [18175918, 18179549, 18185036]) {
  try {
    const rows = await fetchOddsSnapshot(id);
    const parsed = parse1x2FullTime(rows);
    console.log("\n=== fixture", id, "===");
    console.log("rows:", rows.length, "parsed:", parsed);
    const types = [...new Set(rows.map((r) => r.SuperOddsType))];
    console.log("SuperOddsTypes:", types);
    if (rows[0]) console.log("sample row:", JSON.stringify(rows[0], null, 2));
  } catch (e) {
    console.log(id, "err:", e instanceof Error ? e.message : e);
  }
}

try {
  const locked = await ensureMatchOddsLocked(18179549, {
    home: "Colombia",
    away: "Ghana",
    kickoffMs: new Date("2026-07-04T01:30:00Z").getTime(),
  });
  console.log("\nensureMatchOddsLocked:", locked);
} catch (e) {
  console.log("ensure err:", e instanceof Error ? e.message : e);
}
