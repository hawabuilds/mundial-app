import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { resetLeaderboardData } from "../lib/leaderboardReset";

async function main() {
  console.log("Resetting leaderboard…");
  const result = await resetLeaderboardData();
  console.log(`Deleted ${result.predictionsDeleted} prediction row(s).`);
  console.log(`Deleted ${result.snapshotsDeleted} leaderboard_snapshot row(s).`);
  console.log(`Reset ${result.matchStateReset} match_state row(s).`);
  console.log(
    `Players before: ${result.leaderboardBefore.length}, after: ${result.leaderboardAfter.length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
