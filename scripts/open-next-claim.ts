import { config } from "dotenv";
config({ path: ".env.local" });

import { snapshotEpochLeaderboard } from "../lib/snapshotEpoch";

/**
 * Opens the next claim epoch when today's UTC snapshot already ran.
 * Uses a future `now` only to pass the one-snapshot-per-UTC-day guard; the
 * on-chain epoch id still comes from the latest sequential Solana epoch + 1.
 */
async function main() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(12, 0, 0, 0);

  const result = await snapshotEpochLeaderboard(tomorrow);
  console.log(
    JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );

  if (result.status !== "created") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
