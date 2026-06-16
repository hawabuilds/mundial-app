import { ed25519 } from "@noble/curves/ed25519";
import { Keypair, PublicKey } from "@solana/web3.js";
import { keccak256, type Hex } from "viem";
import { computeVoucherId } from "@/lib/payoutVoucher";
import { parseSolanaSecretKey } from "@/lib/solanaKeypair";
import {
  readSolanaPayoutConfig,
  type SolanaPayoutConfig,
} from "@/lib/solanaPayoutConfig";

export type SolanaVoucherMessageParams = {
  programId: PublicKey;
  mint: PublicKey;
  epochId: bigint;
  recipientToken: PublicKey;
  amount: bigint;
  voucherId: Uint8Array;
};

function u64LeBytes(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("amount/epoch_id must fit in u64");
  }
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, value, true);
  return out;
}

function bytes32(value: Uint8Array | PublicKey, label: string): Uint8Array {
  const raw = value instanceof PublicKey ? value.toBytes() : value;
  if (raw.length !== 32) {
    throw new Error(`${label} must be 32 bytes`);
  }
  return raw;
}

/** Matches Anchor `keccak::hashv` field order in `claim`. */
export function computeSolanaVoucherMessageHash(
  params: SolanaVoucherMessageParams,
): Uint8Array {
  const parts = [
    bytes32(params.programId, "programId"),
    bytes32(params.mint, "mint"),
    u64LeBytes(params.epochId),
    bytes32(params.recipientToken, "recipientToken"),
    u64LeBytes(params.amount),
    bytes32(params.voucherId, "voucherId"),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const packed = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    packed.set(part, offset);
    offset += part.length;
  }

  const hex = keccak256(packed) as Hex;
  return hexToBytes(hex);
}

function hexToBytes(hex: Hex): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function computeSolanaVoucherId(
  epochId: bigint,
  userId: string,
): Uint8Array {
  const hex = computeVoucherId(epochId, userId);
  return hexToBytes(hex);
}

export function parseSolanaSignerSecretKey(
  raw: string | undefined,
): Uint8Array | null {
  return parseSolanaSecretKey(raw);
}

export function signSolanaVoucherMessage(
  messageHash: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array {
  if (messageHash.length !== 32) {
    throw new Error("voucher message hash must be 32 bytes (keccak output)");
  }
  if (secretKey.length !== 64) {
    throw new Error("signer secret key must be 64 bytes");
  }
  return ed25519.sign(messageHash, secretKey.slice(0, 32));
}

export type SignedSolanaVoucher = {
  epochId: bigint;
  amount: bigint;
  voucherId: Uint8Array;
  recipientToken: PublicKey;
  messageHash: Uint8Array;
  signature: Uint8Array;
  signerPublicKey: PublicKey;
  config: SolanaPayoutConfig;
};

export function signSolanaClaimVoucher(params: {
  epochId: bigint;
  amount: bigint;
  recipientToken: PublicKey;
  userId: string;
  config?: SolanaPayoutConfig;
  signerSecretKey?: Uint8Array;
}): SignedSolanaVoucher {
  const config = params.config ?? readSolanaPayoutConfig();
  if (!config) {
    throw new Error("Solana payout config is not set");
  }

  const secretKey =
    params.signerSecretKey ??
    parseSolanaSignerSecretKey(process.env.SOLANA_SIGNER_SECRET_KEY);
  if (!secretKey) {
    throw new Error("SOLANA_SIGNER_SECRET_KEY is not set on the server");
  }

  const voucherId = computeSolanaVoucherId(params.epochId, params.userId);
  const messageHash = computeSolanaVoucherMessageHash({
    programId: config.programId,
    mint: config.usdcMint,
    epochId: params.epochId,
    recipientToken: params.recipientToken,
    amount: params.amount,
    voucherId,
  });
  const keypair = Keypair.fromSecretKey(secretKey);
  const signature = signSolanaVoucherMessage(messageHash, secretKey);

  return {
    epochId: params.epochId,
    amount: params.amount,
    voucherId,
    recipientToken: params.recipientToken,
    messageHash,
    signature,
    signerPublicKey: keypair.publicKey,
    config,
  };
}

export function diagnoseSolanaSignerEnv(): string | null {
  try {
    const secretKey = parseSolanaSignerSecretKey(
      process.env.SOLANA_SIGNER_SECRET_KEY,
    );
    if (!secretKey) {
      return "SOLANA_SIGNER_SECRET_KEY is not set on the server (never use NEXT_PUBLIC_ for this)";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid SOLANA_SIGNER_SECRET_KEY";
  }
}
