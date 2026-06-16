/**
 * Read-only: on-chain epoch + signer vs env (no private keys printed).
 * Usage: npx tsx scripts/diagnose-payout-epoch.ts [epochId]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
import { epochIdForDate } from "../lib/epochId";
import {
  readMaxOpenEpochPotWei,
  readPublicPayoutConfig,
  readContractOperatorAddress,
} from "../lib/payoutContract";
import { getAvailableEpochPotWei } from "../lib/payoutLiability";
import { getSupabaseAdminClient } from "../app/lib/supabase";
import {
  readContractSignerAddress,
  readLatestEpochIdOnChain,
  readOnChainEpoch,
} from "../lib/payoutOpenEpoch";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

async function main() {
  const arg = process.argv[2];
  const epochId = arg ? BigInt(arg) : epochIdForDate(new Date());

  const config = readPublicPayoutConfig();
  if (!config) {
    console.error("Missing PAYOUT_CONTRACT_ADDRESS / PAYOUT_CHAIN_ID");
    process.exit(1);
  }

  console.log("contract", config.contractAddress, "chain", config.chainId.toString());
  console.log("epochId", epochId.toString());

  const latest = await readLatestEpochIdOnChain();
  const epoch = await readOnChainEpoch(epochId);
  const signer = await readContractSignerAddress();

  console.log("latestEpochId", latest?.toString() ?? "n/a");
  console.log("epoch", epoch);

  const funding = await readMaxOpenEpochPotWei();
  if (funding) {
    console.log("balanceWei", funding.balance.toString());
    console.log("totalReservedOnChainWei", funding.totalReserved.toString());
    console.log("maxOpenEpochPotWei", funding.maxPot.toString());
  }

  const available = await getAvailableEpochPotWei(epochId);
  if (available) {
    console.log("dbLiabilityWei", available.reservedLiabilityWei.toString());
    console.log("availablePotWei (balance - totalReserved)", available.availablePotWei.toString());
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from("payout_epochs")
      .select("epoch_id, pot_wei, finalized_at")
      .eq("epoch_id", Number(epochId))
      .maybeSingle();
    console.log("payout_epochs row", data);
  } catch (e) {
    console.log("payout_epochs row", "(no supabase)", e);
  }

  const rawKey = process.env.SIGNER_PRIVATE_KEY?.trim();
  if (rawKey && signer) {
    const pk = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
    const server = privateKeyToAccount(pk).address;
    console.log("contract signer", signer);
    console.log("SIGNER_PRIVATE_KEY address", server);
    console.log("signer match", server.toLowerCase() === signer.toLowerCase());
  } else {
    console.log("contract signer", signer ?? "n/a");
    console.log("SIGNER_PRIVATE_KEY", rawKey ? "(set)" : "(missing)");
  }

  const opKey =
    process.env.PAYOUT_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.OPERATOR_PRIVATE_KEY?.trim();
  const operator = await readContractOperatorAddress();
  console.log("contract operator", operator ?? "n/a");
  if (opKey && operator) {
    const pk = (opKey.startsWith("0x") ? opKey : `0x${opKey}`) as Hex;
    const serverOp = privateKeyToAccount(pk).address;
    console.log("PAYOUT_OPERATOR_PRIVATE_KEY address", serverOp);
    console.log(
      "operator match",
      serverOp.toLowerCase() === operator.toLowerCase(),
    );
  } else {
    console.log("PAYOUT_OPERATOR_PRIVATE_KEY", opKey ? "(set)" : "(missing)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
