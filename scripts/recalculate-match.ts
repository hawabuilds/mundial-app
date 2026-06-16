import { getFixtureById, FIXTURES } from "../app/data/fixtures";
import {
  deletePredictionsForMatch,
  getLeaderboard,
  markMatchCollected,
  resetMatchScoring,
  scoreMatchPredictions,
} from "../app/lib/supabase";
import { collectPredictionsForFixture } from "../lib/collectPredictions";

async function tryDeleteMatchPredictions(matchId: number): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      "No SUPABASE_SERVICE_ROLE_KEY — skipping delete (will clear ineligible points at score time).",
    );
    return false;
  }

  try {
    const deleted = await deletePredictionsForMatch(matchId);
    console.log(`Deleted ${deleted} prediction row(s) for match ${matchId}.`);
    return true;
  } catch (error) {
    console.warn("Delete failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  const matchId = Number(process.argv[2] ?? FIXTURES[0]!.id);
  const fixture = getFixtureById(matchId);

  if (!fixture?.result) {
    throw new Error(`Fixture ${matchId} missing or has no result set in fixtures.ts`);
  }

  console.log(`Recalculating match ${matchId}: ${fixture.home} vs ${fixture.away}`);
  console.log(`Final score: ${fixture.result.homeScore}-${fixture.result.awayScore}\n`);

  await tryDeleteMatchPredictions(matchId);
  await resetMatchScoring(matchId);
  console.log("Reset match scoring state.");

  const collected = await collectPredictionsForFixture(fixture);
  console.log("\nCollection:", JSON.stringify(collected, null, 2));

  await markMatchCollected(matchId);

  const scored = await scoreMatchPredictions(matchId, fixture.result);
  console.log("\nScoring:", JSON.stringify(scored, null, 2));

  const board = await getLeaderboard();
  console.log("\nLeaderboard:", JSON.stringify(board, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
