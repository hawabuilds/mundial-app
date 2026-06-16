import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    console.error("API_FOOTBALL_KEY not set");
    process.exit(1);
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const response = await fetch(
    `https://v3.football.api-sports.io/fixtures?date=${today}`,
    { headers: { "x-apisports-key": key }, cache: "no-store" },
  );
  const body = (await response.json()) as {
    response?: Array<{
      fixture: { id: number; date: string; status: { short: string } };
      league: { name: string; country: string };
      teams: { home: { name: string }; away: { name: string } };
    }>;
    errors?: Record<string, string>;
  };

  if (body.errors && Object.keys(body.errors).length > 0) {
    console.error(body.errors);
    process.exit(1);
  }

  const notStarted = new Set(["NS", "TBD", "PST"]);
  const upcoming = (body.response ?? [])
    .filter((row) => new Date(row.fixture.date) > now)
    .filter((row) => notStarted.has(row.fixture.status.short))
    .sort(
      (a, b) =>
        new Date(a.fixture.date).getTime() -
        new Date(b.fixture.date).getTime(),
    );

  console.log(`UTC now: ${now.toISOString()}`);
  console.log(`Date: ${today}`);
  console.log(`Fixtures on API today: ${body.response?.length ?? 0}`);
  console.log(`Still to kick off later today: ${upcoming.length}\n`);

  for (const row of upcoming) {
    const kickoff = row.fixture.date.replace("T", " ").slice(0, 16);
    console.log(
      `${row.fixture.id}\t${kickoff} UTC\t${row.league.name}\t${row.teams.home.name} vs ${row.teams.away.name}`,
    );
  }
}

main();
