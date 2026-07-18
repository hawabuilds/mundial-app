/**
 * Re-post Discord daily leaderboard for an epoch (default: today UTC / 20260715).
 * Usage: npx tsx scripts/repost-discord-leaderboard.ts [epochId]
 */
import { config } from "dotenv";
config({ path: ".env.vercel.discord" });
config({ path: ".env.local" });

import { releaseDiscordLeaderboardPostClaim } from "../app/lib/discordLeaderboardPosts";
import { getSupabaseAdminClient, getLeaderboard } from "../app/lib/supabase";
import { notifyDiscordDailyLeaderboard } from "../lib/discordLeaderboardNotify";
import { isTopTwentyRank } from "../lib/payoutTiers";

async function standingsFromSnapshot(epochId: number) {
  const c = getSupabaseAdminClient();
  const { data, error } = await c
    .from("leaderboard_snapshots")
    .select("rank, user_id, user_handle, total_points")
    .eq("epoch_id", epochId)
    .order("rank", { ascending: true });
  if (error) throw new Error(error.message);
  if (!data?.length) return null;
  return data.map((row) => ({
    rank: Number(row.rank),
    user_id: String(row.user_id),
    user_handle: String(row.user_handle ?? ""),
    total_points: Number(row.total_points ?? 0),
  }));
}

async function main() {
  const epochArg = process.argv[2];
  const epochId = BigInt(
    epochArg && /^\d{8}$/.test(epochArg)
      ? epochArg
      : new Date().toISOString().slice(0, 10).replace(/-/g, ""),
  );

  if (!process.env.DISCORD_LEADERBOARD_WEBHOOK_URL?.trim()) {
    throw new Error("DISCORD_LEADERBOARD_WEBHOOK_URL missing (pull Production env)");
  }

  let standings = await standingsFromSnapshot(Number(epochId));
  if (!standings) {
    console.log("No snapshot rows — falling back to live top 20");
    standings = (await getLeaderboard(20)).filter((e) => isTopTwentyRank(e.rank));
  }

  console.log(`epoch ${epochId}: ${standings.length} standings`);
  await releaseDiscordLeaderboardPostClaim(epochId);
  const result = await notifyDiscordDailyLeaderboard({
    epochId,
    standings,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed" || result.status === "skipped") {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
