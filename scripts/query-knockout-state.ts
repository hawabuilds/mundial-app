import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "@/app/lib/supabase";
import { fetchFixturesSnapshot } from "@/lib/txodds";

async function main(): Promise<void> {
  const snap = await fetchFixturesSnapshot({ fresh: true });
  const teams = /england|norway|argentina|switzerland|suiza/i;
  console.log("TxLINE matches:");
  for (const fx of snap.filter((f) => teams.test(f.Participant1 + f.Participant2))) {
    console.log(
      JSON.stringify({
        id: fx.FixtureId,
        p1: fx.Participant1,
        p2: fx.Participant2,
        home: fx.Participant1IsHome,
        gs: fx.GameState,
        start: new Date(fx.StartTime).toISOString(),
      }),
    );
  }

  const c = getSupabaseAdminClient();
  const { data, error } = await c
    .from("match_state")
    .select(
      "match_id,tx_fixture_id,home_team,away_team,kickoff_at,match_tweet_id,fixture_status,predictions_collected_at",
    )
    .or(
      "home_team.ilike.%England%,home_team.ilike.%Norway%,home_team.ilike.%Argentina%,home_team.ilike.%Switzerland%,away_team.ilike.%England%,away_team.ilike.%Norway%,away_team.ilike.%Argentina%,away_team.ilike.%Switzerland%",
    );

  if (error) console.error(error.message);
  else console.log("\nmatch_state:", JSON.stringify(data, null, 2));
}

void main();
