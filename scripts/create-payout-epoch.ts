import { config } from "dotenv";
config({ path: ".env.local" });

import { upsertPayoutEpochPot } from "../app/lib/payoutEpochs";
import { epochIdForDate, parseEpochId } from "../lib/epochId";

async function main() {
  const epochArg = process.argv[2];
  const potArg = process.argv[3];

  if (!epochArg) {
    console.error(
      "Usage: npx tsx scripts/create-payout-epoch.ts <epochId|today> <potWei>",
    );
    console.error(
      "  Optional: the 12:00 UTC snapshot cron sets pot_wei from the payout contract balance automatically.",
    );
    console.error("  Example: npx tsx scripts/create-payout-epoch.ts today 1000000000000000000");
    console.error("  Example: npx tsx scripts/create-payout-epoch.ts 20260528 1000000000000000000");
    process.exit(1);
  }

  const epochId =
    epochArg === "today" ? epochIdForDate() : parseEpochId(epochArg);

  if (!epochId) {
    console.error("Invalid epochId:", epochArg);
    process.exit(1);
  }

  if (!potArg) {
    console.error("Missing potWei (second argument)");
    process.exit(1);
  }

  let potWei: bigint;
  try {
    potWei = BigInt(potArg);
  } catch {
    console.error("Invalid potWei:", potArg);
    process.exit(1);
  }

  if (potWei <= 0n) {
    console.error("potWei must be positive");
    process.exit(1);
  }

  const row = await upsertPayoutEpochPot(epochId, potWei);
  console.log(JSON.stringify(row, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
