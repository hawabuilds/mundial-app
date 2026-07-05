import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.production.local" });
config({ path: ".env.local" });

import { getMatchProof, toMatchProofSummary } from "../app/lib/supabase";
import { upgradeTerminalFallbackProofs } from "../lib/matchProofFetch";

async function main() {
  const matchIdArg = process.argv.find((a) => /^\d+$/.test(a));
  const matchId = matchIdArg ? Number.parseInt(matchIdArg, 10) : null;

  if (matchId != null) {
    const before = await getMatchProof(matchId).catch(() => null);
    console.log("Before:", before ? JSON.stringify(toMatchProofSummary(before), null, 2) : null);
  }

  const result = await upgradeTerminalFallbackProofs();
  console.log("Upgrade pass:", JSON.stringify(result, null, 2));

  if (matchId != null) {
    const after = await getMatchProof(matchId).catch(() => null);
    console.log("After:", after ? JSON.stringify(toMatchProofSummary(after), null, 2) : null);
  }

  process.exit(result.upgraded > 0 ? 0 : result.attempted > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
