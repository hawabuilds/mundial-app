import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { rescoreMatches } from "../lib/rescoreMatch";

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const matchIds =
    args.length > 0
      ? args.map((arg) => Number.parseInt(arg, 10)).filter((id) => Number.isFinite(id))
      : [];

  if (matchIds.length === 0) {
    console.error("Usage: npm run rescore:match -- <matchId> [matchId…]");
    process.exit(1);
  }

  const results = await rescoreMatches(matchIds);
  for (const row of results) {
    if (row.status === "ok") {
      console.log(
        `Match ${row.matchId}: ${row.result.predictionsScored} predictions`,
        row.result.breakdown,
      );
    } else if (row.status === "skipped") {
      console.log(`Match ${row.matchId}: skipped — ${row.reason}`);
    } else {
      console.error(`Match ${row.matchId}: error — ${row.error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
