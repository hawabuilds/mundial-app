import { config } from "dotenv";
config({ path: ".env.local" });

import {
  getLeaderboard,
  resetMatchScoring,
  scoreMatchPredictions,
} from "../app/lib/supabase";

async function main() {
  const matchId = Number(process.argv[2] ?? 2);
  const home = Number(process.argv[3] ?? 3);
  const away = Number(process.argv[4] ?? 0);

  await resetMatchScoring(matchId);
  const scored = await scoreMatchPredictions(matchId, {
    homeScore: home,
    awayScore: away,
  });
  console.log("Scored:", JSON.stringify(scored, null, 2));
  console.log("Leaderboard:", JSON.stringify(await getLeaderboard(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
