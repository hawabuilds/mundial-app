import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "@/app/lib/supabase";

const TWEET = "2076979253099245637";

async function main() {
  const c = getSupabaseAdminClient();

  const { data: state, error: se } = await c
    .from("match_state")
    .select(
      "match_id,home_team,away_team,kickoff_at,match_tweet_id,predictions_collected_at,fixture_status",
    )
    .eq("match_tweet_id", TWEET)
    .maybeSingle();
  if (se) throw new Error(se.message);
  console.log("match_state:", JSON.stringify(state, null, 2));

  if (!state) {
    const { data: byTeams } = await c
      .from("match_state")
      .select(
        "match_id,home_team,away_team,kickoff_at,match_tweet_id,predictions_collected_at",
      )
      .or("home_team.ilike.%France%,away_team.ilike.%France%")
      .or("home_team.ilike.%Spain%,away_team.ilike.%Spain%");
    console.log("france/spain candidates:", JSON.stringify(byTeams, null, 2));
    return;
  }

  const matchId = Number(state.match_id);
  const { count: predCount } = await c
    .from("predictions")
    .select("user_id", { count: "exact", head: true })
    .eq("match_id", matchId);
  console.log("predictions count:", predCount);

  const { data: botRows, error: be } = await c
    .from("prediction_bot_replies")
    .select("user_id,user_handle,status,error,created_at,updated_at,bot_tweet_id")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  if (be) {
    console.log("prediction_bot_replies error:", be.message);
  } else {
    console.log("bot rows:", JSON.stringify(botRows, null, 2));
    console.log("bot row count:", botRows?.length ?? 0);
  }

  const kickoff = state.kickoff_at ? new Date(String(state.kickoff_at)) : null;
  const now = new Date();
  console.log("now UTC:", now.toISOString());
  console.log("kickoff UTC:", kickoff?.toISOString() ?? null);
  if (kickoff) {
    console.log(
      "minutes until/after kickoff:",
      ((now.getTime() - kickoff.getTime()) / 60_000).toFixed(1),
    );
  }
  console.log(
    "predictions_collected_at:",
    state.predictions_collected_at ?? null,
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
