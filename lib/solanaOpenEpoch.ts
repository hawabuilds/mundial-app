import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { parseSolanaSecretKey } from "@/lib/solanaKeypair";
import {
  findConfigPda,
  findEpochPda,
  findVaultPda,
} from "@/lib/solanaPayoutPdas";
import { readSolanaPayoutConfig } from "@/lib/solanaPayoutConfig";
import { encodeOpenEpochInstructionData } from "@/lib/solanaOpenEpochInstruction";

const CONFIG_DISCRIMINATOR_LEN = 8;

export type SolanaOnChainConfig = {
  admin: PublicKey;
  operator: PublicKey;
  signer: Uint8Array;
  mint: PublicKey;
  totalReserved: bigint;
  latestEpoch: bigint;
  paused: boolean;
};

export type SolanaOnChainEpoch = {
  open: boolean;
  pot: bigint;
  claimed: bigint;
};

export type OpenSolanaEpochResult =
  | { status: "opened"; signature: string; epochId: bigint; pot: bigint }
  | { status: "already_open"; epochId: bigint; pot: bigint }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

function readOperatorKeypair(): Keypair | null {
  try {
    const secret = parseSolanaSecretKey(
      process.env.SOLANA_OPERATOR_SECRET_KEY?.trim(),
    );
    if (!secret) return null;
    return Keypair.fromSecretKey(secret);
  } catch {
    return null;
  }
}

export function diagnoseSolanaOperatorEnv(): string | null {
  try {
    const keypair = readOperatorKeypair();
    if (!keypair) {
      return "SOLANA_OPERATOR_SECRET_KEY is not set — run: npm run gen:solana-keys";
    }
    readSolanaPayoutConfig();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid operator key";
  }
}

export function decodeConfigAccount(data: Buffer): SolanaOnChainConfig | null {
  if (data.length < CONFIG_DISCRIMINATOR_LEN + 32 * 4 + 8 + 8 + 2) {
    return null;
  }
  let offset = CONFIG_DISCRIMINATOR_LEN;
  const admin = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const operator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const signer = data.subarray(offset, offset + 32);
  offset += 32;
  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const totalReserved = data.readBigUInt64LE(offset);
  offset += 8;
  const latestEpoch = data.readBigUInt64LE(offset);
  offset += 8;
  const paused = data[offset] === 1;

  return {
    admin,
    operator,
    signer,
    mint,
    totalReserved,
    latestEpoch,
    paused,
  };
}

export function decodeEpochAccount(data: Buffer): SolanaOnChainEpoch | null {
  if (data.length < CONFIG_DISCRIMINATOR_LEN + 8 + 8 + 8 + 1) {
    return null;
  }
  const offset = CONFIG_DISCRIMINATOR_LEN;
  const epochId = data.readBigUInt64LE(offset);
  const pot = data.readBigUInt64LE(offset + 8);
  const claimed = data.readBigUInt64LE(offset + 16);
  return {
    open: epochId > 0n && pot > 0n,
    pot,
    claimed,
  };
}

export async function readSolanaConfig(
  connection: Connection,
  programId: PublicKey,
): Promise<SolanaOnChainConfig | null> {
  const address = findConfigPda(programId);
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account?.data) return null;
  return decodeConfigAccount(account.data);
}

export async function readSolanaEpoch(
  connection: Connection,
  programId: PublicKey,
  epochId: bigint,
): Promise<SolanaOnChainEpoch | null> {
  const address = findEpochPda(programId, epochId);
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account?.data) {
    return { open: false, pot: 0n, claimed: 0n };
  }
  return decodeEpochAccount(account.data);
}

export async function readSolanaVaultBalance(
  connection: Connection,
  programId: PublicKey,
): Promise<bigint | null> {
  try {
    const vault = findVaultPda(programId);
    const account = await getAccount(connection, vault, "confirmed");
    return BigInt(account.amount.toString());
  } catch {
    return null;
  }
}

export async function openSolanaEpoch(params: {
  epochId: bigint;
  pot: bigint;
  connection?: Connection;
  operator?: Keypair;
}): Promise<OpenSolanaEpochResult> {
  let config;
  try {
    config = readSolanaPayoutConfig();
  } catch (error) {
    return {
      status: "error",
      reason:
        error instanceof Error
          ? error.message
          : "Solana payout config is not set",
    };
  }

  const operator = params.operator ?? readOperatorKeypair();
  if (!operator) {
    return {
      status: "error",
      reason: "SOLANA_OPERATOR_SECRET_KEY is not set",
    };
  }

  if (params.pot <= 0n) {
    return { status: "error", reason: "pot must be greater than zero" };
  }

  const connection =
    params.connection ?? new Connection(config.rpcUrl, "confirmed");

  const onChainConfig = await readSolanaConfig(connection, config.programId);
  if (!onChainConfig) {
    return {
      status: "error",
      reason: "Config account not found — run program initialize first",
    };
  }

  if (onChainConfig.paused) {
    return { status: "skipped", reason: "Program is paused" };
  }

  if (!onChainConfig.operator.equals(operator.publicKey)) {
    return {
      status: "error",
      reason: `Operator key mismatch — on-chain ${onChainConfig.operator.toBase58()}, env ${operator.publicKey.toBase58()}`,
    };
  }

  const existing = await readSolanaEpoch(
    connection,
    config.programId,
    params.epochId,
  );
  if (existing?.open) {
    return {
      status: "already_open",
      epochId: params.epochId,
      pot: existing.pot,
    };
  }

  if (params.epochId <= onChainConfig.latestEpoch) {
    return {
      status: "error",
      reason: `epoch_id must be greater than latest on-chain epoch ${onChainConfig.latestEpoch.toString()}`,
    };
  }

  const vaultBalance = await readSolanaVaultBalance(connection, config.programId);
  if (vaultBalance === null) {
    return { status: "error", reason: "Vault token account not found" };
  }

  const free = vaultBalance - onChainConfig.totalReserved;
  if (free < params.pot) {
    return {
      status: "error",
      reason: `Insufficient unreserved USDC in vault (free ${free.toString()}, need ${params.pot.toString()})`,
    };
  }

  const configPda = findConfigPda(config.programId);
  const vaultPda = findVaultPda(config.programId);
  const epochPda = findEpochPda(config.programId, params.epochId);

  const ix = new TransactionInstruction({
    programId: config.programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: operator.publicKey, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: epochPda, isSigner: false, isWritable: true },
      { pubkey: operator.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(encodeOpenEpochInstructionData(params.epochId, params.pot)),
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = operator.publicKey;
  tx.sign(operator);

  try {
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return {
      status: "opened",
      signature,
      epochId: params.epochId,
      pot: params.pot,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "open_epoch transaction failed";
    return { status: "error", reason };
  }
}
