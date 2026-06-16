import { config } from "dotenv";
config({ path: ".env.local" });

const CLUB_LEAGUE_HINTS =
  /club|u21|u23|u20|u19|u18|youth|reserve|women|femenin|feminin|ladies|premier league|la liga|serie a|bundesliga|ligue 1|championship|division|league one|league two|mls|j1|j2|k league|super lig|eredivisie|primeira|scottish|fa cup|carabao|dfb|coupe|copa del rey|coppa|super cup|afc champions|asean club|conference league|europa league|champions league/i;

type ApiRow = {
  fixture: { id: number; date: string; status: { short: string } };
  league: { name: string; country: string };
  teams: {
    home: { name: string; code: string | null };
    away: { name: string; code: string | null };
  };
};

function isNationalTeamFixture(row: ApiRow): boolean {
  const league = row.league.name;
  const country = row.league.country;
  if (/friendlies clubs/i.test(league)) return false;
  if (CLUB_LEAGUE_HINTS.test(league)) return false;
  if (country === "World") return true;
  if (
    /friendl|nations league|world cup|euro|copa america|copa afr|afcon|asian cup|gold cup|qualif|international|confederations|olympic|arab cup|nations cup/i.test(
      league,
    )
  ) {
    return true;
  }
  return false;
}

const YOUTH_OR_WOMEN = /\bU\d{2}\b|\bW\b|Women|Feminin|Femenin/i;

function isSeniorNationalFriendly(row: ApiRow): boolean {
  const league = row.league.name;
  if (row.league.country !== "World") return false;
  if (!/^friendlies$/i.test(league.trim())) return false;
  if (/club/i.test(league)) return false;
  if (YOUTH_OR_WOMEN.test(row.teams.home.name)) return false;
  if (YOUTH_OR_WOMEN.test(row.teams.away.name)) return false;
  return true;
}

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
    response?: ApiRow[];
    errors?: Record<string, string>;
  };

  if (body.errors && Object.keys(body.errors).length > 0) {
    console.error(body.errors);
    process.exit(1);
  }

  const rows = body.response ?? [];
  const national = rows
    .filter(isSeniorNationalFriendly)
    .sort(
      (a, b) =>
        new Date(a.fixture.date).getTime() -
        new Date(b.fixture.date).getTime(),
    );

  console.log(`UTC now: ${now.toISOString()}`);
  console.log(`Date: ${today}`);
  console.log(`National/international fixtures: ${national.length}\n`);

  for (const row of national) {
    const kickoff = new Date(row.fixture.date);
    console.log(
      JSON.stringify({
        id: row.fixture.id,
        date: kickoff.toISOString().slice(0, 10),
        time: kickoff.toISOString().slice(11, 16),
        status: row.fixture.status.short,
        league: row.league.name,
        home: row.teams.home.name,
        away: row.teams.away.name,
        homeCode: row.teams.home.code,
        awayCode: row.teams.away.code,
      }),
    );
  }
}

main();
