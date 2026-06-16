/**
 * List FIFA World Cup fixtures from API-Football for adding to app/data/fixtures.ts.
 *
 * Usage:
 *   npx tsx scripts/list-world-cup-fixtures.ts 2026-06-15
 *   npx tsx scripts/list-world-cup-fixtures.ts 2026-06-15 brazil
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const key = process.env.API_FOOTBALL_KEY?.trim();
if (!key) {
  console.error("API_FOOTBALL_KEY missing");
  process.exit(1);
}

const date = process.argv[2];
const nameFilter = process.argv.slice(3).map((s) => s.toLowerCase());

async function main() {
  const path = date
    ? `/fixtures?date=${date}`
    : "/fixtures?league=1&season=2026&timezone=UTC";

  const res = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { "x-apisports-key": key },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json()) as {
    response?: Array<{
      fixture: { id: number; date: string; status: { short: string } };
      league: { name: string; round: string | null };
      teams: { home: { name: string }; away: { name: string } };
      score: {
        fulltime: { home: number | null; away: number | null };
      };
    }>;
    errors?: Record<string, string>;
  };

  if (body.errors && Object.keys(body.errors).length > 0) {
    console.error(body.errors);
    process.exit(1);
  }

  const rows = (body.response ?? []).filter((row) =>
    /world cup/i.test(row.league.name),
  );

  console.log(`World Cup fixtures: ${rows.length}\n`);

  for (const row of rows) {
    const blob = `${row.teams.home.name} ${row.teams.away.name}`.toLowerCase();
    if (nameFilter.length > 0 && !nameFilter.every((f) => blob.includes(f))) {
      continue;
    }
    const kickoff = new Date(row.fixture.date);
    const ft = row.score.fulltime;
    console.log(
      JSON.stringify({
        externalFixtureId: row.fixture.id,
        date: kickoff.toISOString().slice(0, 10),
        time: kickoff.toISOString().slice(11, 16),
        home: row.teams.home.name,
        away: row.teams.away.name,
        group: `FIFA World Cup${row.league.round ? ` · ${row.league.round}` : ""}`,
        status: row.fixture.status.short,
        fulltime:
          ft.home != null && ft.away != null ? `${ft.home}-${ft.away}` : null,
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
