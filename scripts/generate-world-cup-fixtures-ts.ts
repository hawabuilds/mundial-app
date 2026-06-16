/**
 * Write app/data/worldCup2026Fixtures.ts from API-Football list output.
 *
 *   npx tsx scripts/list-world-cup-fixtures.ts > wc.jsonl
 *   npx tsx scripts/generate-world-cup-fixtures-ts.ts wc.jsonl
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_ID = Number(process.env.WC_START_MATCH_ID ?? 1);
const inputPath = process.argv[2] ?? "wc2026-raw.txt";
const outPath = join(process.cwd(), "app/data/worldCup2026Fixtures.ts");

function normalizeTeam(name: string): string {
  return name
    .replace(/T├╝rkiye|T\u00fcrkiye/gi, "Türkiye")
    .replace(/Cura├ºao/g, "Curaçao");
}

function normalizeGroup(group: string): string {
  return group
    .replace(/┬╖/g, "·")
    .replace(
      /FIFA World Cup · Group Stage - (\d+)/,
      "FIFA World Cup · Matchday $1",
    );
}

type Row = {
  externalFixtureId: number;
  date: string;
  time: string;
  home: string;
  away: string;
  group: string;
};

function parseLines(raw: string): Row[] {
  const rows: Row[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const o = JSON.parse(t) as Row;
      rows.push({
        ...o,
        home: normalizeTeam(o.home),
        away: normalizeTeam(o.away),
        group: normalizeGroup(o.group),
      });
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => {
    const da = `${a.date}T${a.time}`;
    const db = `${b.date}T${b.time}`;
    return da.localeCompare(db) || a.externalFixtureId - b.externalFixtureId;
  });
  return rows;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const rows = parseLines(readFileSync(inputPath, "utf8"));
if (rows.length === 0) {
  console.error("No fixture rows parsed from", inputPath);
  process.exit(1);
}

const lines: string[] = [
  `import type { Fixture } from "./fixtures";`,
  ``,
  `/** FIFA World Cup 2026 group stage (${rows.length} matches, match ids ${START_ID}–${START_ID + rows.length - 1}). */`,
  `export const WORLD_CUP_2026_FIXTURES: Fixture[] = [`,
];

for (let i = 0; i < rows.length; i++) {
  const r = rows[i]!;
  const id = START_ID + i;
  lines.push(`  {
    id: ${id},
    home: "${esc(r.home)}",
    away: "${esc(r.away)}",
    date: "${r.date}",
    time: "${r.time}",
    group: "${esc(r.group)}",
    externalFixtureId: ${r.externalFixtureId},
  },`);
}

lines.push(`];`, "");

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${rows.length} fixtures to ${outPath}`);

const teams = new Set<string>();
for (const r of rows) teams.add(r.home).add(r.away);
console.log("Teams:", [...teams].sort().join(", "));
