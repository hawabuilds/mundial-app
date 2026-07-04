import {
  Connection,
  Ed25519Program,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { SolanaClaimVoucherResponse } from "@/app/lib/solana-claim-voucher-client";
import { encodeClaimInstructionData } from "@/lib/solanaClaimInstruction";
import { isPlaceholderProgramId } from "@/lib/solanaPayoutConfig";

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function buildSolanaClaimTransaction(
  voucher: SolanaClaimVoucherResponse,
  payer: PublicKey,
): Transaction {
  if (isPlaceholderProgramId(voucher.programId)) {
    throw new Error(
      "MUNDIAL_REWARDS_PROGRAM_ID is still the placeholder — set it to the deployed devnet program ID before claiming",
    );
  }

  if (!voucher.programDeployed) {
    throw new Error(
      "Solana rewards program is not deployed yet — your voucher is signed and ready once deploy finishes",
    );
  }

  const programId = new PublicKey(voucher.programId);
  const epochId = BigInt(voucher.epochId);
  const amount = BigInt(voucher.amount);
  const voucherId = hexToBytes(voucher.voucherId);
  const messageHash = hexToBytes(voucher.messageHash);
  const signature = hexToBytes(voucher.signature);
  const signerPublicKey = new PublicKey(voucher.signerPublicKey).toBytes();

  // Create the recipient's USDC ATA if missing — the program requires it to
  // already exist. Idempotent, so it's a no-op when the account is present.
  const recipientToken = new PublicKey(voucher.recipientToken);
  const createRecipientAtaIx =
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      recipientToken,
      payer,
      new PublicKey(voucher.usdcMint),
    );

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: signerPublicKey,
    message: messageHash,
    signature,
  });

  const claimIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: new PublicKey(voucher.accounts.config), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(voucher.accounts.epoch), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(voucher.accounts.vault), isSigner: false, isWritable: true },
      {
        pubkey: recipientToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(voucher.accounts.claimMarker),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(encodeClaimInstructionData(epochId, amount, voucherId)),
  });

  const tx = new Transaction().add(createRecipientAtaIx, ed25519Ix, claimIx);
  tx.feePayer = payer;
  return tx;
}

export async function submitSolanaClaimTransaction(params: {
  voucher: SolanaClaimVoucherResponse;
  connection: Connection;
  payer: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}): Promise<string> {
  const tx = buildSolanaClaimTransaction(params.voucher, params.payer);
  const { blockhash, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const signed = await params.signTransaction(tx);
  const raw = signed.serialize();
  const signature = await params.connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 5,
  });

  await confirmBySignatureStatus({
    connection: params.connection,
    signature,
    rawTransaction: raw,
    lastValidBlockHeight,
  });

  return signature;
}

/**
 * Confirm by polling signature status instead of relying on
 * connection.confirmTransaction, which throws a false "block height exceeded"
 * error on slow public RPCs even when the transaction lands. Rebroadcasts
 * periodically until the network reports a status or the blockhash truly expires.
 */
async function confirmBySignatureStatus(params: {
  connection: Connection;
  signature: string;
  rawTransaction: Uint8Array;
  lastValidBlockHeight: number;
}): Promise<void> {
  const { connection, signature, rawTransaction, lastValidBlockHeight } = params;
  const POLL_INTERVAL_MS = 2_000;
  const MAX_WAIT_MS = 90_000;
  const start = Date.now();
  let lastResendAt = 0;

  while (Date.now() - start < MAX_WAIT_MS) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];

    if (status) {
      if (status.err) {
        throw new Error(
          `Claim transaction failed on-chain: ${JSON.stringify(status.err)}`,
        );
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return;
      }
    }

    // Rebroadcast every ~6s in case the first send was dropped by the RPC.
    if (Date.now() - lastResendAt > 6_000) {
      lastResendAt = Date.now();
      try {
        await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
          maxRetries: 5,
        });
      } catch {
        // Ignore resend errors; we only care about the polled status.
      }
    }

    let currentHeight: number | null = null;
    try {
      currentHeight = await connection.getBlockHeight("confirmed");
    } catch {
      currentHeight = null;
    }
    if (currentHeight !== null && currentHeight > lastValidBlockHeight + 150) {
      // Re-check status once more before declaring expiry.
      const { value: finalValue } = await connection.getSignatureStatuses([
        signature,
      ]);
      const finalStatus = finalValue[0];
      if (finalStatus && !finalStatus.err) return;
      throw new Error(
        "Transaction expired before confirmation — please try Collect again",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Last attempt before giving up.
  const { value } = await connection.getSignatureStatuses([signature]);
  if (value[0] && !value[0].err) return;
  throw new Error(
    "Could not confirm the claim in time — check your wallet; it may have still succeeded",
  );
}
