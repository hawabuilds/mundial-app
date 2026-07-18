/**
 * Test X OAuth 1.0a write credentials / bot reply.
 *
 * Usage:
 *   npx tsx scripts/test-reply-bot.ts --smoke
 *   npx tsx scripts/test-reply-bot.ts <tweetId>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PREDICTION_REPLY_BOT_MESSAGE } from "@/lib/predictionReplyBot";
import {
  postTweetAsUser,
  readXUserOAuth1Credentials,
} from "@/lib/xPostTweet";

async function main(): Promise<void> {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error(
      "Usage:\n  npx tsx scripts/test-reply-bot.ts --smoke\n  npx tsx scripts/test-reply-bot.ts <tweetId>",
    );
    process.exit(1);
  }

  const creds = readXUserOAuth1Credentials();
  if (!creds) {
    console.error(
      "Missing X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET in .env.local",
    );
    process.exit(1);
  }
  console.log("OAuth1 credentials: present");

  if (arg === "--smoke") {
    const text = `Copa Mundial bot OAuth check ✓ ${new Date().toISOString()} (safe to delete)`;
    console.log("Posting smoke tweet…");
    const result = await postTweetAsUser({ text });
    if (!result.ok) {
      console.error("FAILED:", result.status, result.error);
      process.exit(1);
    }
    console.log("OK — posted smoke tweet:", result.tweetId);
    console.log(`https://x.com/copamundialapp/status/${result.tweetId}`);
    return;
  }

  const tweetId = arg.replace(/\D/g, "") || arg;
  console.log(`Replying to tweet ${tweetId} with bot message…`);
  const result = await postTweetAsUser({
    text: PREDICTION_REPLY_BOT_MESSAGE,
    inReplyToTweetId: tweetId,
  });
  if (!result.ok) {
    console.error("FAILED:", result.status, result.error);
    process.exit(1);
  }
  console.log("OK — bot reply posted:", result.tweetId);
  console.log(`https://x.com/copamundialapp/status/${result.tweetId}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
