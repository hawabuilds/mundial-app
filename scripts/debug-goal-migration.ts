import { config } from "dotenv";
config({ path: ".env.local" });

import { getMatchGoals, getSupabaseAdminClient } from "../app/lib/supabase";
import { assessGoalDataCompleteness } from "../lib/firstGoalscorerCompleteness";
import {
  derivePersistableMatchGoalsFromScoreSequence,
  loadScoreEventsForBackfill,
} from "../lib/backfillMatchGoals";

async function main() {
  const sb = getSupabaseAdminClient();

  const { data: sample, error: sampleErr } = await sb
    .from("match_goals")
    .select(
      "fixture_id, player_id, clock_seconds, seq, player, minute, side, goal_key",
    )
    .limit(5);

  console.log(
    JSON.stringify(
      { schemaCheck: { error: sampleErr?.message ?? null, rows: sample } },
      null,
      2,
    ),
  );

  const txId = 18188721;
  const { data: rows, error: rowErr } = await sb
    .from("match_goals")
    .select("*")
    .eq("fixture_id", txId);

  console.log(
    JSON.stringify({ dbRows: { error: rowErr?.message ?? null, rows } }, null, 2),
  );

  const events = await loadScoreEventsForBackfill(txId);
  const actionGoals = events.filter(
    (e) =>
      e.Action === "goal" ||
      e.Action === "penalty_outcome" ||
      e.Action === "action_amend",
  );

  const derived = derivePersistableMatchGoalsFromScoreSequence(events, true, 0, 1);

  console.log(
    JSON.stringify(
      {
        txFixtureId: txId,
        historicalEvents: events.length,
        actionEvents: actionGoals.length,
        firstAction: actionGoals[0] ?? null,
        derived,
        loadedGoals: await getMatchGoals(txId),
        assessment: assessGoalDataCompleteness(
          await getMatchGoals(txId),
          0,
          1,
        ),
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
