import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchFixturesSnapshot, getTxoddsOrigin } from "../lib/txodds";
import { normalizeStartTimeMs } from "../lib/formatKickoff";
import { isFriendlyCompetition } from "../lib/matchStage";

async function main() {
  const from = process.argv[2] ?? "2026-06-28";
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const fx = await fetchFixturesSnapshot({ fresh: true });
  const rows = fx
    .filter((f) => {
      if (isFriendlyCompetition(f.Competition ?? "")) return false;
      return normalizeStartTimeMs(f.StartTime) >= fromMs;
    })
    .sort(
      (a, b) =>
        normalizeStartTimeMs(a.StartTime) - normalizeStartTimeMs(b.StartTime),
    );

  console.log("origin:", getTxoddsOrigin(), "from:", from, "count:", rows.length);
  for (const f of rows) {
    const home = f.Participant1IsHome ? f.Participant1 : f.Participant2;
    const away = f.Participant1IsHome ? f.Participant2 : f.Participant1;
    const iso = new Date(normalizeStartTimeMs(f.StartTime)).toISOString();
    console.log(
      JSON.stringify({
        txFixtureId: f.FixtureId,
        date: iso.slice(0, 10),
        time: iso.slice(11, 16),
        home,
        away,
        competition: f.Competition,
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
