import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";
import { getMatchGoals, getMatchState, isMatchScored } from "../app/lib/supabase";
import {
  extractActionGoals,
  fetchScoreSequence,
  fetchScoresSnapshot,
} from "../lib/txodds";
import { isMatchGoalsInconsistentWithScore } from "../lib/backfillMatchGoals";

const TODAY = "2026-07-07";

function goalSummary(
  goals: {
    minute: number | null;
    side: string;
    player: string | null;
  }[],
): string {
  if (!goals.length) return "(no rows)";
  return goals
    .map(
      (g) =>
        `${g.side} ${g.minute ?? "?"}' ${g.player ?? "(blank)"}`,
    )
    .join("; ");
}

async function main() {
  const todayFixtures = FIXTURES.filter((f) => f.date === TODAY);
  console.log(`Today's fixtures (${TODAY}): ${todayFixtures.length}\n`);

  for (const fixture of todayFixtures) {
    const txId = fixture.externalFixtureId;
    if (!txId) continue;

    const scored = await isMatchScored(fixture.id).catch(() => false);
    const state = await getMatchState(fixture.id).catch(() => null);
    const goals = await getMatchGoals(txId).catch(() => []);
    const homeScore = state?.final_home_score;
    const awayScore = state?.final_away_score;

    const missingScorer = goals.filter((g) => !g.player || g.minute == null);
    const inconsistent =
      typeof homeScore === "number" && typeof awayScore === "number"
        ? isMatchGoalsInconsistentWithScore(goals, homeScore, awayScore)
        : null;

    const hist = await fetchScoreSequence(txId);
    const snap = await fetchScoresSnapshot(txId);
    const feedGoals = extractActionGoals(hist.length > 0 ? hist : snap);

    console.log(`--- ${fixture.home} vs ${fixture.away} (match ${fixture.id}, tx ${txId})`);
    console.log(`  scored: ${scored}`);
    console.log(
      `  final: ${homeScore ?? "?"}-${awayScore ?? "?"}`,
    );
    console.log(`  match_goals (${goals.length}): ${goalSummary(goals)}`);
    console.log(
      `  missing player/minute rows: ${missingScorer.length}`,
    );
    console.log(`  inconsistent with score: ${inconsistent}`);
    console.log(
      `  TxLINE historical/snapshot events: ${hist.length}/${snap.length}`,
    );
    console.log(
      `  TxLINE action goals: ${feedGoals.map((g) => `P${g.participant} ${g.minute}' ${g.player ?? "(blank)"}`).join("; ") || "(none)"}`,
    );
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
