import { FIXTURES } from "../app/data/fixtures";
import { markMatchCollected } from "../app/lib/supabase";
import { collectPredictionsForFixture } from "../lib/collectPredictions";
import { autoScoreFinishedMatches } from "../lib/scoreFinishedMatches";

async function main() {
  const fixture = FIXTURES[0]!;

  console.log("Collecting replies for", fixture.home, "vs", fixture.away, "...");
  const collected = await collectPredictionsForFixture(fixture);
  console.log(JSON.stringify(collected, null, 2));

  await markMatchCollected(fixture.id);
  console.log("Marked match collected.");

  console.log("\nScoring finished match...");
  const scored = await autoScoreFinishedMatches();
  console.log(JSON.stringify(scored, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
