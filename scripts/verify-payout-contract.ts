/**
 * Verify ScorePayout env: signer/operator roles, balance, voucher signing.
 * Usage: npx tsx scripts/verify-payout-contract.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  readContractOperatorAddress,
  readContractPaused,
  readMaxOpenEpochPotWei,
  readPublicPayoutConfig,
  recoverVoucherSigner,
} from "../lib/payoutContract";
import { readContractSignerAddress } from "../lib/payoutOpenEpoch";
import {
  computeVoucherId,
  computeVoucherInnerHash,
  signVoucherInner,
} from "../lib/payoutVoucher";

async function main() {
  const config = readPublicPayoutConfig();
  if (!config) {
    console.error("Missing PAYOUT_CONTRACT_ADDRESS / PAYOUT_CHAIN_ID");
    process.exit(1);
  }

  console.log("ScorePayout", config.contractAddress, "chain", config.chainId.toString());

  const [signer, operator, paused, funding] = await Promise.all([
    readContractSignerAddress(),
    readContractOperatorAddress(),
    readContractPaused(),
    readMaxOpenEpochPotWei(),
  ]);

  console.log("paused", paused);
  console.log("contract signer", signer);
  console.log("contract operator", operator);
  if (funding) {
    console.log("balanceWei", funding.balance.toString());
    console.log("maxOpenEpochPotWei", funding.maxPot.toString());
  }

  const signerKey = process.env.SIGNER_PRIVATE_KEY?.trim();
  if (signerKey) {
    const pk = (signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`) as Hex;
    const serverSigner = privateKeyToAccount(pk).address;
    console.log("SIGNER_PRIVATE_KEY address", serverSigner);
    console.log("signer match", serverSigner.toLowerCase() === signer?.toLowerCase());

    const epochId = 20260608n;
    const voucherId = computeVoucherId(epochId, "test-user");
    const inner = computeVoucherInnerHash({
      contractAddress: config.contractAddress,
      chainId: config.chainId,
      epochId,
      to: getAddress("0x0000000000000000000000000000000000000001"),
      amount: 1n,
      voucherId,
    });
    const sig = await signVoucherInner(inner, pk);
    const recovered = await recoverVoucherSigner(inner, sig);
    console.log(
      "voucher sig recovers to",
      recovered,
      recovered?.toLowerCase() === serverSigner.toLowerCase() ? "(ok)" : "(MISMATCH)",
    );
  }

  const opKey =
    process.env.PAYOUT_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.OPERATOR_PRIVATE_KEY?.trim();
  if (opKey) {
    const pk = (opKey.startsWith("0x") ? opKey : `0x${opKey}`) as Hex;
    const serverOp = privateKeyToAccount(pk).address;
    console.log("PAYOUT_OPERATOR_PRIVATE_KEY address", serverOp);
    console.log(
      "operator match",
      serverOp.toLowerCase() === operator?.toLowerCase(),
    );
  } else {
    console.log("PAYOUT_OPERATOR_PRIVATE_KEY (missing — openEpoch must be manual)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
