import { config } from "dotenv";
config({ path: ".env.local" });

import { fixtureCacheKey } from "@/app/data/fixtures";
import { getSupabaseAdminClient, saveMatchTweetId } from "@/app/lib/supabase";

const jobs = [
  {
    matchId: 18213979,
    home: "Norway",
    away: "England",
    date: "2026-07-11",
    tweetId: "2075995261210386810",
  },
  {
    matchId: 18222446,
    home: "Argentina",
    away: "Switzerland",
    date: "2026-07-12",
    tweetId: "2076086965921792310",
  },
];

async function main(): Promise<void> {
  for (const job of jobs) {
    await saveMatchTweetId(
      job.matchId,
      job.tweetId,
      fixtureCacheKey({ home: job.home, away: job.away, date: job.date }),
    );
    console.log(`Saved ${job.home} vs ${job.away} → ${job.tweetId}`);
  }

  const c = getSupabaseAdminClient();
  const { data, error } = await c
    .from("match_state")
    .select(
      "match_id,home_team,away_team,match_tweet_id,fixture_status,predictions_collected_at",
    )
    .in("match_id", jobs.map((j) => j.matchId));

  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

void main();
