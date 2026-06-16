import { config } from "dotenv";
config({ path: ".env.local" });

const key = process.env.API_FOOTBALL_KEY?.trim();
if (!key) {
  console.error("API_FOOTBALL_KEY missing");
  process.exit(1);
}

const date = process.argv[2] ?? "2026-05-31";
const filter = process.argv.slice(3).map((s) => s.toLowerCase());

async function main() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?date=${date}`,
    { headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(25_000) },
  );
  const body = (await res.json()) as {
    response?: Array<{
      fixture: { id: number; date: string; status: { short: string } };
      teams: { home: { name: string }; away: { name: string } };
      goals: { home: number | null; away: number | null };
    }>;
  };

  const rows = body.response ?? [];
  console.log(`date=${date} total=${rows.length}\n`);

  for (const row of rows) {
    const blob = `${row.teams.home.name} ${row.teams.away.name}`.toLowerCase();
    if (filter.length > 0 && !filter.every((f) => blob.includes(f))) continue;
    if (
      filter.length === 0 &&
      !/(poland|ukraine|germany|finland|usa|senegal|brazil|panama|psg|arsenal|paris)/i.test(
        blob,
      )
    ) {
      continue;
    }
    const kickoff = row.fixture.date.slice(11, 16);
    console.log(
      `${row.fixture.id}\t${row.teams.home.name} vs ${row.teams.away.name}\t${kickoff} UTC\t${row.fixture.status.short}\t${row.goals.home ?? "-"}-${row.goals.away ?? "-"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
