import { config } from "dotenv";
config({ path: ".env.local" });

import { fixtureDateTime, getFixtureById } from "../app/data/fixtures";
import { getMatchState } from "../app/lib/supabase";
import {
  fetchTxLineMatch,
  mapMatchRow,
  resolveFinalScoreFromTxLineMatch,
} from "../lib/txMatchSettlement";
import {
  autoScoreFinishedMatches,
  getFixturesPendingAutoScore,
} from "../lib/scoreFinishedMatches";

async function main() {
  const now = new Date();
  console.log("now", now.toISOString());

  const pending = await getFixturesPendingAutoScore();
  console.log(
    "pending auto-score:",
    pending.map((f) => `${f.id} ${f.home} vs ${f.away}`),
  );

  const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const inspect = ids.length > 0 ? ids : [13, 14];

  for (const id of inspect) {
    const f = getFixtureById(id);
    if (!f) continue;
    const state = await getMatchState(id);
    console.log(`\n--- match ${id} ${f.home} vs ${f.away} ---`);
    console.log("collected_at", state?.predictions_collected_at ?? null);
    console.log("scored_at", state?.scored_at ?? null);

    const row = await fetchTxLineMatch(f);
    if (!row) {
      console.log("api: no row");
      continue;
    }
    const live = mapMatchRow(row);
    const final = resolveFinalScoreFromTxLineMatch(
      row,
      fixtureDateTime(f).getTime(),
      now.getTime(),
      90,
    );
    console.log(
      "api",
      live.status,
      `${live.homeScore ?? "?"}-${live.awayScore ?? "?"}`,
      "settlement",
      final,
    );
  }

  const targets = ids.length
    ? pending.filter((f) => ids.includes(f.id))
    : pending;

  if (targets.length === 0) {
    console.log("\nNo fixtures due for auto-score right now.");
    return;
  }

  const results = await autoScoreFinishedMatches(targets);
  console.log("\nauto-score results:", JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
