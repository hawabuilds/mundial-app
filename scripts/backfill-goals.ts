import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { getFixtureById } from "../app/data/fixtures";
import {
  backfillMatchGoals,
  backfillMatchGoalsByTxFixture,
  deriveMatchGoalsFromScoreSequence,
  isMatchGoalsInconsistentWithScore,
} from "../lib/backfillMatchGoals";
import { getMatchGoals } from "../app/lib/supabase";

function formatGoalRows(
  rows: {
    minute: number | null;
    side: string;
    player: string | null;
    ownGoal: boolean;
    penalty: boolean;
  }[],
): string {
  if (rows.length === 0) return "  (none)";
  return rows
    .map(
      (goal) =>
        `  ${goal.side} ${goal.minute ?? "?"}' ${goal.player ?? "(unknown)"}${goal.penalty ? " (P)" : ""}${goal.ownGoal ? " (OG)" : ""}`,
    )
    .join("\n");
}

function printResult(result: {
  status: string;
  txFixtureId?: number;
  reason?: string;
  homeScore?: number;
  awayScore?: number;
  sequenceEvents?: number;
  before: { minute: number | null; side: string; player: string | null; ownGoal: boolean; penalty: boolean }[];
  after: { minute: number | null; side: string; player: string | null; ownGoal: boolean; penalty: boolean }[];
}) {
  console.log(`Status: ${result.status}`);
  if (result.txFixtureId != null) console.log(`TxLINE fixture: ${result.txFixtureId}`);
  if (result.status === "backfilled") {
    console.log(`Final score: ${result.homeScore}-${result.awayScore}`);
    console.log(`Sequence events: ${result.sequenceEvents}`);
    console.log(`Rows: ${result.before.length} → ${result.after.length}\n`);
  } else if (result.reason) {
    console.log(`Reason: ${result.reason}\n`);
  }

  console.log("Before:");
  console.log(formatGoalRows(result.before));
  console.log("\nAfter:");
  console.log(formatGoalRows(result.after));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const txFlag = args.indexOf("--tx");
  if (txFlag >= 0) {
    const txFixtureId = Number.parseInt(args[txFlag + 1] ?? "", 10);
    const scoreFlag = args.indexOf("--score");
    const scoreRaw = scoreFlag >= 0 ? args[scoreFlag + 1] : null;
    const [homeRaw, awayRaw] = (scoreRaw ?? "").split("-");
    const homeScore = Number.parseInt(homeRaw ?? "", 10);
    const awayScore = Number.parseInt(awayRaw ?? "", 10);

    if (!Number.isFinite(txFixtureId) || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
      console.error("Usage: npm run backfill:goals -- --tx <txFixtureId> --score <home>-<away>");
      process.exit(1);
    }

    console.log(`Backfilling TxLINE fixture ${txFixtureId} (${homeScore}-${awayScore})…\n`);

    if (dryRun) {
      const before = await getMatchGoals(txFixtureId).catch(() => []);
      const { loadScoreEventsForBackfill } = await import("../lib/backfillMatchGoals");
      const events = await loadScoreEventsForBackfill(txFixtureId);
      const after = deriveMatchGoalsFromScoreSequence(events, true, homeScore, awayScore);
      printResult({
        status: isMatchGoalsInconsistentWithScore(before, homeScore, awayScore)
          ? "dry-run (would backfill)"
          : "dry-run (skipped)",
        txFixtureId,
        homeScore,
        awayScore,
        sequenceEvents: events.length,
        before,
        after: isMatchGoalsInconsistentWithScore(before, homeScore, awayScore)
          ? after
          : before,
      });
      return;
    }

    const result = await backfillMatchGoalsByTxFixture({
      txFixtureId,
      homeScore,
      awayScore,
    });

    if (result.status === "error") {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    printResult(result);
    return;
  }

  const matchId = Number.parseInt(args[0] ?? "", 10);
  if (!Number.isFinite(matchId) || matchId <= 0) {
    console.error("Usage: npm run backfill:goals -- <matchId>");
    console.error("       npm run backfill:goals -- --tx <txFixtureId> --score <home>-<away>");
    process.exit(1);
  }

  const fixture = getFixtureById(matchId);
  console.log(
    `Backfilling match_goals for match ${matchId}${fixture ? ` (${fixture.home} vs ${fixture.away})` : ""}…\n`,
  );

  const result = await backfillMatchGoals(matchId);
  if (result.status === "error") {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  printResult(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
