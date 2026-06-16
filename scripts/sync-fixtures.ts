import { config } from "dotenv";
config({ path: ".env.local" });

import { FIXTURES, formatFixtureLabel } from "../app/data/fixtures";
import {
  registryGap,
  syncFixtureRegistryToSupabase,
} from "../lib/syncFixtureRegistry";

async function main() {
  const result = await syncFixtureRegistryToSupabase(FIXTURES);
  const missing = registryGap(result);

  console.log("Fixture registry sync\n");
  for (const fixture of FIXTURES) {
    console.log(`  ${fixture.id}: ${formatFixtureLabel(fixture)}`);
  }

  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (missing.length > 0) {
    console.error(`\nMissing match_state rows for ids: ${missing.join(", ")}`);
    process.exitCode = 1;
  }

  if (result.skipped.length > 0) {
    console.warn("\nSkipped (protected existing matches):", result.skipped);
  }

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
