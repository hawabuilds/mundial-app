import { config } from "dotenv";
config({ path: ".env.local" });

import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";
import { getMatchState, getSupabaseAdminClient } from "../app/lib/supabase";

async function main() {
  const sb = getSupabaseAdminClient();
  const now = Date.now();

  const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const fixtures = (ids.length ? FIXTURES.filter((f) => ids.includes(f.id)) : FIXTURES)
    .filter((f) => {
      const ko = fixtureDateTime(f).getTime();
      return ko <= now && now - ko < 7 * 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => fixtureDateTime(a).getTime() - fixtureDateTime(b).getTime());

  console.log("now:", new Date(now).toISOString());
  console.log(
    "match | kickoff(UTC) | collected_at | Δcollect(min) | scored_at | Δscore(min) | preds",
  );

  for (const f of fixtures) {
    const ko = fixtureDateTime(f);
    const state = await getMatchState(f.id);
    const { count } = await sb
      .from("predictions")
      .select("*", { count: "exact", head: true })
      .eq("match_id", f.id);

    const collAt = state?.predictions_collected_at
      ? new Date(state.predictions_collected_at)
      : null;
    const scoreAt = state?.scored_at ? new Date(state.scored_at) : null;
    const dColl = collAt
      ? Math.round((collAt.getTime() - ko.getTime()) / 60000)
      : null;
    const dScore = scoreAt
      ? Math.round((scoreAt.getTime() - ko.getTime()) / 60000)
      : null;

    console.log(
      `${String(f.id).padStart(2)} ${f.home}-${f.away} | ${ko.toISOString().slice(5, 16)} | ${
        collAt ? collAt.toISOString().slice(5, 16) : "—".padEnd(11)
      } | ${dColl ?? "—"} | ${
        scoreAt ? scoreAt.toISOString().slice(5, 16) : "—".padEnd(11)
      } | ${dScore ?? "—"} | ${count ?? 0}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
