import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { FIXTURES, fixtureDateTime } from "../app/data/fixtures";
import { getMatchGoals, getMatchState, isMatchScored } from "../app/lib/supabase";
import {
  backfillRecentSettledGoalData,
  isWithinTxlineHistoricalWindow,
  TXLINE_HISTORICAL_RETENTION_MS,
} from "../lib/backfillMatchGoals";
import { assessGoalDataCompleteness } from "../lib/firstGoalscorerCompleteness";

async function main() {
  const applyBackfill = process.argv.includes("--backfill");
  const dryRun = process.argv.includes("--dry-run");

  if (applyBackfill && !dryRun) {
    console.log("Running TxLINE historical backfill for recent settled matches…\n");
    const backfill = await backfillRecentSettledGoalData(FIXTURES);
    console.log(JSON.stringify(backfill, null, 2));
    console.log("");
  }

  const settleable: Array<Record<string, unknown>> = [];
  const incomplete: Array<Record<string, unknown>> = [];
  const outsideWindow: Array<Record<string, unknown>> = [];

  for (const fixture of FIXTURES) {
    const label = `${fixture.home} vs ${fixture.away}`;
    const scored = await isMatchScored(fixture.id).catch(() => false);
    if (!scored) continue;

    const state = await getMatchState(fixture.id);
    const homeScore = state?.final_home_score;
    const awayScore = state?.final_away_score;
    if (typeof homeScore !== "number" || typeof awayScore !== "number") continue;

    const withinWindow = isWithinTxlineHistoricalWindow(fixture);
    const txFixtureId = fixture.externalFixtureId;
    const goals =
      txFixtureId != null
        ? await getMatchGoals(txFixtureId).catch(() => [])
        : [];

    const assessment = assessGoalDataCompleteness(goals, homeScore, awayScore);
    const row = {
      matchId: fixture.id,
      fixture: label,
      txFixtureId: txFixtureId ?? null,
      score: `${homeScore}-${awayScore}`,
      kickoff: fixtureDateTime(fixture).toISOString(),
      withinHistoricalWindow: withinWindow,
      goalRows: goals.length,
      status: assessment.status,
      settleableForFirstScorer: assessment.settleableForFirstScorer,
      reasons: assessment.reasons,
      firstGoalscorer: assessment.firstGoalscorer
        ? {
            player: assessment.firstGoalscorer.player,
            playerId: assessment.firstGoalscorer.playerId,
            side: assessment.firstGoalscorer.side,
            clockSeconds: assessment.firstGoalscorer.clockSeconds,
            seq: assessment.firstGoalscorer.seq,
            penalty: assessment.firstGoalscorer.penalty,
            ownGoal: assessment.firstGoalscorer.ownGoal,
          }
        : null,
    };

    if (!withinWindow) {
      outsideWindow.push(row);
    } else if (assessment.settleableForFirstScorer) {
      settleable.push(row);
    } else {
      incomplete.push(row);
    }
  }

  console.log(
    JSON.stringify(
      {
        auditedAt: new Date().toISOString(),
        historicalWindowDays: TXLINE_HISTORICAL_RETENTION_MS / (24 * 60 * 60 * 1000),
        backfillRan: applyBackfill && !dryRun,
        summary: {
          settleable: settleable.length,
          incomplete: incomplete.length,
          outsideHistoricalWindow: outsideWindow.length,
        },
        settleable,
        incomplete,
        outsideHistoricalWindow: outsideWindow,
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
