import { config } from "dotenv";
config({ path: ".env.local" });

import { getSnapshotEntry } from "../app/lib/leaderboardSnapshots";
import { parsePotWei } from "../app/lib/payoutEpochs";
import { getPayoutEpoch } from "../app/lib/payoutEpochs";
import { upsertUserWallet } from "../app/lib/userWallets";
import { submitSolanaClaimTransaction } from "../app/lib/submitSolanaClaimTransaction";
import type { SolanaClaimVoucherResponse } from "../app/lib/solana-claim-voucher-client";
import { getSolanaClaimAccounts } from "../lib/solanaClaimMarker";
import { isSolanaVoucherClaimed } from "../lib/solanaClaimMarker";
import { payoutAmountWei } from "../lib/payoutTiers";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import {
  computeSolanaVoucherId,
  signSolanaClaimVoucher,
} from "../lib/solanaPayoutVoucher";
import { getSupabaseAdminClient } from "../app/lib/supabase";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { parseSolanaSecretKey } from "../lib/solanaKeypair";

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

async function fetchRankOne(epochId: bigint) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("epoch_id, user_id, user_handle, rank, total_points")
    .eq("epoch_id", Number(epochId))
    .eq("rank", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No rank-1 row for epoch ${epochId.toString()}`);
  return data as {
    user_id: string;
    user_handle: string;
    rank: number;
    total_points: number;
  };
}

async function ensureDevnetSol(
  connection: Connection,
  recipient: PublicKey,
): Promise<void> {
  const balance = await connection.getBalance(recipient, "confirmed");
  if (balance >= 0.02 * LAMPORTS_PER_SOL) return;

  const funderSecret = parseSolanaSecretKey(
    process.env.SOLANA_OPERATOR_SECRET_KEY?.trim(),
  );
  if (!funderSecret) {
    throw new Error(
      "Claimer needs SOL for fees — fund the wallet or set SOLANA_OPERATOR_SECRET_KEY",
    );
  }
  const funder = Keypair.fromSecretKey(funderSecret);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: recipient,
      lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
    }),
  );
  await sendAndConfirmTransaction(connection, tx, [funder], {
    commitment: "confirmed",
  });
}

async function main() {
  const epochArg = process.argv[2];
  const epochId = epochArg ? BigInt(epochArg) : 1n;

  const solanaConfig = readSolanaPayoutConfig();
  const connection = new Connection(solanaConfig.rpcUrl, "confirmed");

  const epoch = await getPayoutEpoch(epochId);
  if (!epoch?.finalized_at) {
    throw new Error(`Epoch ${epochId.toString()} is not finalized — run snapshot first`);
  }

  const potWei = parsePotWei(epoch.pot_wei);
  if (!potWei) throw new Error("Epoch pot missing");

  const winner = await fetchRankOne(epochId);
  const amount = payoutAmountWei(potWei, winner.rank);
  if (!amount || amount <= 0n) {
    throw new Error("Could not derive payout amount for rank 1");
  }

  const already = await isSolanaVoucherClaimed(
    connection,
    solanaConfig.programId,
    epochId,
    winner.user_id,
  );
  if (already) {
    console.log(
      JSON.stringify({
        status: "already_claimed",
        epochId: epochId.toString(),
        userId: winner.user_id,
        handle: winner.user_handle,
      }),
    );
    return;
  }

  const claimer = Keypair.generate();
  await ensureDevnetSol(connection, claimer.publicKey);

  await upsertUserWallet(winner.user_id, claimer.publicKey.toBase58());

  const recipientToken = getAssociatedTokenAddressSync(
    solanaConfig.usdcMint,
    claimer.publicKey,
  );

  const signed = signSolanaClaimVoucher({
    epochId,
    amount,
    recipientToken,
    userId: winner.user_id,
    config: solanaConfig,
  });

  const voucherId = computeSolanaVoucherId(epochId, winner.user_id);
  const accounts = getSolanaClaimAccounts(
    solanaConfig.programId,
    epochId,
    voucherId,
  );

  const voucher: SolanaClaimVoucherResponse = {
    epochId: epochId.toString(),
    amount: amount.toString(),
    rank: winner.rank,
    owner: claimer.publicKey.toBase58(),
    recipientToken: recipientToken.toBase58(),
    voucherId: bytesToHex(voucherId),
    messageHash: bytesToHex(signed.messageHash),
    signature: bytesToHex(signed.signature),
    signerPublicKey: signed.signerPublicKey.toBase58(),
    programId: solanaConfig.programId.toBase58(),
    usdcMint: solanaConfig.usdcMint.toBase58(),
    rpcUrl: solanaConfig.rpcUrl,
    cluster: solanaConfig.cluster,
    programDeployed: true,
    accounts: {
      config: accounts.config.toBase58(),
      vault: accounts.vault.toBase58(),
      epoch: accounts.epoch.toBase58(),
      claimMarker: accounts.claimMarker.toBase58(),
    },
  };

  const usdcBefore = await getAccount(connection, recipientToken).catch(() => null);

  const signature = await submitSolanaClaimTransaction({
    voucher,
    connection,
    payer: claimer.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(claimer);
      return tx;
    },
  });

  const usdcAfter = await getAccount(connection, recipientToken);
  const claimedBase = usdcAfter.amount - (usdcBefore?.amount ?? 0n);

  const snapshot = await getSnapshotEntry(epochId, winner.user_id);

  console.log(
    JSON.stringify(
      {
        status: "claimed",
        epochId: epochId.toString(),
        winner: {
          userId: winner.user_id,
          handle: winner.user_handle,
          rank: winner.rank,
          totalPoints: winner.total_points,
        },
        payout: {
          amountBaseUnits: amount.toString(),
          receivedBaseUnits: claimedBase.toString(),
        },
        claimerWallet: claimer.publicKey.toBase58(),
        recipientToken: recipientToken.toBase58(),
        signature,
        explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        snapshotConfirmed: Boolean(snapshot),
        claimMarkerUsed: await isSolanaVoucherClaimed(
          connection,
          solanaConfig.programId,
          epochId,
          winner.user_id,
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
