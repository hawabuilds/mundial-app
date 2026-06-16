import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { getPayoutEpoch, parsePotWei } from "../app/lib/payoutEpochs";
import { getSupabaseAdminClient } from "../app/lib/supabase";
import {
  fetchBnbUsdPrice,
  fetchBnbUsdPriceAtTime,
} from "../lib/bnbUsdPrice";
import { potUsdCentsFromWei } from "../lib/potUsd";

const epochArg = process.argv[2]?.trim();

async function ensurePotUsdColumn() {
  const supabase = getSupabaseAdminClient();
  const probe = await supabase.from("payout_epochs").select("pot_usd_cents").limit(1);
  if (!probe.error) return;

  if (!probe.error.message.includes("pot_usd_cents")) {
    throw new Error(probe.error.message);
  }

  const sql = readFileSync("supabase/add-pot-usd-cents.sql", "utf8");
  console.error(
    "payout_epochs.pot_usd_cents is missing. Run this in Supabase SQL editor:\n",
    sql,
  );
  process.exit(1);
}

async function main() {
  await ensurePotUsdColumn();
  if (!epochArg || !/^\d{8}$/.test(epochArg)) {
    console.error("Usage: npx tsx scripts/backfill-epoch-pot-usd.ts YYYYMMDD");
    process.exit(1);
  }

  const epochId = BigInt(epochArg);
  const row = await getPayoutEpoch(epochId);
  if (!row) {
    console.error(`No payout_epochs row for ${epochArg}`);
    process.exit(1);
  }

  const potWei = parsePotWei(row.pot_wei);
  if (!potWei) {
    console.error(`Invalid pot_wei for epoch ${epochArg}`);
    process.exit(1);
  }

  const bnbUsd = row.finalized_at
    ? await fetchBnbUsdPriceAtTime(new Date(row.finalized_at))
    : await fetchBnbUsdPrice();

  const potUsdCents = potUsdCentsFromWei(potWei, bnbUsd);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("payout_epochs")
    .update({ pot_usd_cents: potUsdCents })
    .eq("epoch_id", Number(epochId));

  if (error) {
    throw new Error(error.message);
  }

  console.log(
    JSON.stringify(
      {
        epochId: epochArg,
        potWei: potWei.toString(),
        bnbUsd,
        potUsdCents,
        potUsd: (potUsdCents / 100).toFixed(2),
        finalizedAt: row.finalized_at,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
