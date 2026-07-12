import type { LeaderboardEntry } from "@/app/lib/supabase";
import {
  claimDiscordLeaderboardPost,
  releaseDiscordLeaderboardPostClaim,
} from "@/app/lib/discordLeaderboardPosts";
import {
  formatLeaderboardDiscordDate,
  renderLeaderboardImage,
} from "@/lib/renderLeaderboardImage";

const DISCORD_USERNAME = "Copa Mundial";
const DISCORD_AVATAR_URL = "https://copamundial.app/mundial-logo.jpg";

export type DiscordLeaderboardNotifyResult =
  | { status: "skipped"; reason: string }
  | { status: "posted"; epochId: string }
  | { status: "failed"; reason: string };

async function postLeaderboardPngToDiscord(
  webhookUrl: string,
  png: Buffer,
  content: string,
  filename: string,
): Promise<void> {
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content,
      username: DISCORD_USERNAME,
      avatar_url: DISCORD_AVATAR_URL,
    }),
  );
  form.append(
    "files[0]",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    filename,
  );

  const res = await fetch(webhookUrl, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook ${res.status}${body ? `: ${body}` : ""}`);
  }
}

/**
 * Renders the snapshot standings and posts to Discord.
 * Failures are returned, not thrown — callers must not let this break snapshot/payout.
 */
export async function notifyDiscordDailyLeaderboard(input: {
  epochId: bigint;
  standings: LeaderboardEntry[];
}): Promise<DiscordLeaderboardNotifyResult> {
  const webhookUrl = process.env.DISCORD_LEADERBOARD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { status: "skipped", reason: "DISCORD_LEADERBOARD_WEBHOOK_URL not set" };
  }

  if (input.standings.length === 0) {
    return { status: "skipped", reason: "No standings to post" };
  }

  const epochKey = input.epochId.toString();
  const claimed = await claimDiscordLeaderboardPost(input.epochId);
  if (!claimed) {
    return {
      status: "skipped",
      reason: `Discord leaderboard already posted for epoch ${epochKey}`,
    };
  }

  try {
    const png = await renderLeaderboardImage({
      epochId: input.epochId,
      standings: input.standings,
    });
    const dateLabel = formatLeaderboardDiscordDate(input.epochId);
    const content = `🏆 Daily Top 20 — ${dateLabel}. GG to today's qualifiers 🔵`;

    await postLeaderboardPngToDiscord(
      webhookUrl,
      png,
      content,
      `daily-leaderboard-${epochKey}.png`,
    );

    return { status: "posted", epochId: epochKey };
  } catch (error) {
    await releaseDiscordLeaderboardPostClaim(input.epochId);
    const reason =
      error instanceof Error ? error.message : "Discord leaderboard post failed";
    console.error("[discord-leaderboard]", reason);
    return { status: "failed", reason };
  }
}
