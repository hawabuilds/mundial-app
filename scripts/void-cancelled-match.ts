import { config } from "dotenv";
config({ path: ".env.local" });

import { getFixtureById } from "../app/data/fixtures";
import {
  deletePredictionsForMatch,
  getMatchState,
  resetMatchCollection,
  resetMatchScoring,
} from "../app/lib/supabase";

async function main() {
  const matchId = Number(process.argv[2]);
  if (!Number.isInteger(matchId)) {
    console.error("Usage: npx tsx scripts/void-cancelled-match.ts <matchId>");
    process.exit(1);
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) {
    console.error(`Unknown matchId: ${matchId}`);
    process.exit(1);
  }

  if (!fixture.cancelled) {
    console.error(
      `Fixture ${matchId} is not marked cancelled in fixtures.ts — set cancelled: true first.`,
    );
    process.exit(1);
  }

  console.log(`Voiding match ${matchId}: ${fixture.home} vs ${fixture.away}\n`);

  const before = await getMatchState(matchId);
  console.log("match_state before:", before);

  const deleted = await deletePredictionsForMatch(matchId);
  await resetMatchScoring(matchId);
  await resetMatchCollection(matchId);

  const after = await getMatchState(matchId);
  console.log(`\nDeleted ${deleted} prediction row(s).`);
  console.log("match_state after reset:", after);
  console.log(
    "\nMatch will not appear in UI or crons while cancelled: true in fixtures.ts.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
