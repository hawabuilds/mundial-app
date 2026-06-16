import { Connection, PublicKey } from "@solana/web3.js";
import {
  findClaimMarkerPda,
  findConfigPda,
  findEpochPda,
  findVaultPda,
} from "@/lib/solanaPayoutPdas";
import { computeSolanaVoucherId } from "@/lib/solanaPayoutVoucher";

const CLAIM_MARKER_USED_OFFSET = 8;

export async function isSolanaVoucherClaimed(
  connection: Connection,
  programId: PublicKey,
  epochId: bigint,
  userId: string,
): Promise<boolean | null> {
  try {
    const voucherId = computeSolanaVoucherId(epochId, userId);
    const marker = findClaimMarkerPda(programId, voucherId);
    const account = await connection.getAccountInfo(marker, "confirmed");
    if (!account) return false;
    if (account.data.length < CLAIM_MARKER_USED_OFFSET + 1) return null;
    return account.data[CLAIM_MARKER_USED_OFFSET] === 1;
  } catch {
    return null;
  }
}

export function getSolanaClaimAccounts(
  programId: PublicKey,
  epochId: bigint,
  voucherId: Uint8Array,
) {
  return {
    config: findConfigPda(programId),
    vault: findVaultPda(programId),
    epoch: findEpochPda(programId, epochId),
    claimMarker: findClaimMarkerPda(programId, voucherId),
  };
}
