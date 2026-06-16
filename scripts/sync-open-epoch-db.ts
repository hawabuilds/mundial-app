/**
 * Align payout_epochs with an epoch already opened on-chain (operator Remix tx).
 * Usage: npx tsx scripts/sync-open-epoch-db.ts <epochId>
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayoutEpoch, upsertPayoutEpochPot } from "../app/lib/payoutEpochs";
import { parseEpochId } from "../lib/epochId";
import { readOnChainEpoch } from "../lib/payoutOpenEpoch";

async function main() {
  const epochId = parseEpochId(process.argv[2]);
  if (!epochId) {
    console.error("Usage: npx tsx scripts/sync-open-epoch-db.ts <epochId>");
    process.exit(1);
  }

  const onChain = await readOnChainEpoch(epochId);
  if (!onChain?.open || onChain.pot <= 0n) {
    console.error("Epoch is not open on-chain or pot is zero:", onChain);
    process.exit(1);
  }

  const existing = await getPayoutEpoch(epochId);
  if (existing?.finalized_at) {
    console.log("Already finalized; pot_wei =", existing.pot_wei);
    if (existing.pot_wei !== onChain.pot.toString()) {
      const { setPayoutEpochPotWei } = await import("../app/lib/payoutEpochs");
      await setPayoutEpochPotWei(epochId, onChain.pot);
      console.log("Updated pot_wei to on-chain", onChain.pot.toString());
    }
    return;
  }

  const row = await upsertPayoutEpochPot(epochId, onChain.pot);
  console.log("Upserted payout_epochs:", row);
  console.log(
    "Next: run snapshot for this UTC day (npx tsx scripts/snapshot-epoch.ts with date override or cron)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
