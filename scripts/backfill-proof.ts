import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.production.local" });
config({ path: ".env.local", override: false });

// .env.production.local may define empty placeholders — prefer real values from .env.local.
for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"]) {
  if (!process.env[key]?.trim()) {
    config({ path: ".env.local", override: true });
    break;
  }
}

import { getFixtureById } from "../app/data/fixtures";
import { getMatchProof, toMatchProofSummary } from "../app/lib/supabase";
import {
  fetchAndPersistMatchProof,
  refreshStoredProofSemantics,
} from "../lib/matchProofFetch";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const matchId = Number.parseInt(
    args.find((a) => /^\d+$/.test(a)) ?? "",
    10,
  );

  if (!Number.isFinite(matchId)) {
    console.error("Usage: npm run backfill:proof -- <matchId> [--force]");
    process.exit(1);
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) {
    console.error(`Unknown match id: ${matchId}`);
    process.exit(1);
  }

  console.log(
    `Backfilling TxLINE proof for match ${matchId} (${fixture.home} vs ${fixture.away})${force ? " [force]" : ""}`,
  );

  const result = await fetchAndPersistMatchProof(matchId, fixture, { force });
  let stored = await getMatchProof(matchId).catch(() => null);
  if (stored && !stored.showVerifiedBadge) {
    await refreshStoredProofSemantics(matchId, fixture, stored);
    stored = await getMatchProof(matchId).catch(() => null);
  }

  console.log(JSON.stringify({ ...result, fixtureId: matchId }, null, 2));
  if (stored) {
    console.log("Summary:", JSON.stringify(toMatchProofSummary(stored), null, 2));
  }

  process.exit(result.stored ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
