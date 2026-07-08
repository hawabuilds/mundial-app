import { anchorGlobalDiscriminator } from "@/lib/solanaClaimInstruction";
import { readU64Le } from "@/lib/binaryLe";
import { Connection, PublicKey } from "@solana/web3.js";

export type ParsedSolanaClaimTx = {
  epochId: bigint;
  amountBaseUnits: bigint;
  recipientTokenAccount: string;
  blockTime: Date | null;
};

const CLAIM_DISC = anchorGlobalDiscriminator("claim");

function instructionDataMatchesClaim(data: Uint8Array): boolean {
  if (data.length < 48) return false;
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== CLAIM_DISC[i]) return false;
  }
  return true;
}

/** Parse a confirmed Mundial Rewards `claim` instruction from a devnet tx. */
export function parseClaimInstructionFromTx(
  tx: NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>,
  programId: PublicKey,
): ParsedSolanaClaimTx | null {
  const message = tx.transaction.message;
  const accountKeys = message.getAccountKeys().staticAccountKeys;

  for (const ix of message.compiledInstructions) {
    const programKey = accountKeys[ix.programIdIndex];
    if (!programKey?.equals(programId)) continue;

    const data = ix.data;
    if (!instructionDataMatchesClaim(data)) continue;

    const epochId = readU64Le(data, 8);
    const amountBaseUnits = readU64Le(data, 16);

    const recipientIndex = ix.accountKeyIndexes[3];
    const recipientKey = accountKeys[recipientIndex];
    if (!recipientKey) return null;

    return {
      epochId,
      amountBaseUnits,
      recipientTokenAccount: recipientKey.toBase58(),
      blockTime:
        tx.blockTime != null ? new Date(tx.blockTime * 1000) : null,
    };
  }

  return null;
}

export async function fetchConfirmedClaimTx(
  connection: Connection,
  signature: string,
  programId: PublicKey,
): Promise<ParsedSolanaClaimTx> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Transaction not found on Solana (wrong cluster or signature?)");
  }
  if (tx.meta?.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
  }

  const parsed = parseClaimInstructionFromTx(tx, programId);
  if (!parsed) {
    throw new Error("Transaction is not a Mundial Rewards claim instruction");
  }

  return parsed;
}
