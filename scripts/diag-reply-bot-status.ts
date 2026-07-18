import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "../app/lib/supabase";
import { loadOpenMatchThreadsForReplyBot } from "../lib/runLivePredictionReplyBot";
import { isPredictionReplyBotEnabled } from "../lib/predictionReplyBot";
import { fetchReplies } from "../lib/fetchReplies";
import { parsePrediction } from "../lib/predictionParser";
import { isReplyBeforeKickoff } from "../lib/predictionEligibility";
import type { Fixture } from "../app/data/fixtures";

async function main() {
  const c = getSupabaseAdminClient();
  console.log("bot enabled locally:", isPredictionReplyBotEnabled());
  console.log("X_REPLY_BOT_ENABLED=", process.env.X_REPLY_BOT_ENABLED);

  const threads = await loadOpenMatchThreadsForReplyBot();
  console.log("open threads:", threads.length);
  for (const t of threads) {
    console.log(
      `  ${t.matchId} ${t.home} vs ${t.away} kickoff=${t.kickoffAt} tweet=${t.tweetId}`,
    );
  }

  for (const status of ["pending", "sent", "failed", "skipped"] as const) {
    const { count } = await c
      .from("prediction_bot_replies")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    console.log(`${status}:`, count);
  }

  const { data: pending } = await c
    .from("prediction_bot_replies")
    .select("match_id,user_handle,status,source_tweet_id,created_at,error")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(40);
  console.log("pending oldest-first:", JSON.stringify(pending, null, 2));

  const { data: recentSent } = await c
    .from("prediction_bot_replies")
    .select("match_id,user_handle,status,updated_at,bot_tweet_id")
    .eq("status", "sent")
    .order("updated_at", { ascending: false })
    .limit(10);
  console.log("last sent:", JSON.stringify(recentSent, null, 2));

  if (!threads[0]) return;

  const t = threads[0];
  const replies = await fetchReplies(t.tweetId, { maxPages: 2 });
  console.log(`fetched ${replies.length} replies for match ${t.matchId}`);

  const fixture: Fixture = {
    id: t.matchId,
    home: t.home,
    away: t.away,
    date: t.kickoffAt.slice(0, 10),
    time: t.kickoffAt.slice(11, 16),
    group: "FIFA World Cup",
    externalFixtureId: t.matchId,
    autoSettleFromApi: true,
    tweetId: t.tweetId,
  };

  const newest = [...replies]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15);

  for (const r of newest) {
    const valid = parsePrediction(r.text, fixture);
    const before = isReplyBeforeKickoff(r.createdAt, fixture);
    const { data: botRow } = await c
      .from("prediction_bot_replies")
      .select("status,bot_tweet_id,error")
      .eq("match_id", t.matchId)
      .eq("user_id", r.authorId)
      .maybeSingle();
    console.log(
      JSON.stringify({
        at: r.createdAt,
        user: r.authorUsername,
        id: r.id,
        valid: Boolean(valid),
        before,
        text: r.text.slice(0, 80),
        bot: botRow ?? null,
      }),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
