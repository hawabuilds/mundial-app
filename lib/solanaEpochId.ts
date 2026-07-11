import { Connection, PublicKey } from "@solana/web3.js";
import { epochIdForDate, getFirstSnapshotEpochId } from "@/lib/epochId";
import { readSolanaConfig } from "@/lib/solanaOpenEpoch";

/** Calendar YYYYMMDD when FIRST_SNAPSHOT_EPOCH_ID is set; else sequential devnet ids. */
export function useSequentialSolanaEpochIds(): boolean {
  const mode = process.env.SOLANA_EPOCH_ID_MODE?.trim().toLowerCase();
  if (mode === "calendar") return false;
  if (mode === "sequential") return true;
  return getFirstSnapshotEpochId() === null;
}

export async function resolveSolanaOpenEpochId(params: {
  connection: Connection;
  programId: PublicKey;
  requested?: bigint | null;
}): Promise<bigint | null> {
  const onChain = await readSolanaConfig(params.connection, params.programId);
  if (!onChain) {
    return params.requested ?? null;
  }

  const requested = params.requested ?? null;
  if (requested !== null && requested > onChain.latestEpoch) {
    return requested;
  }

  if (useSequentialSolanaEpochIds()) {
    return onChain.latestEpoch + 1n;
  }

  return requested ?? epochIdForDate();
}
