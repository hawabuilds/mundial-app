import { Connection, PublicKey } from "@solana/web3.js";
import { epochIdForDate } from "@/lib/epochId";
import { readSolanaConfig } from "@/lib/solanaOpenEpoch";

/** Devnet uses timestamp epochs; production would use YYYYMMDD. */
export function useSequentialSolanaEpochIds(): boolean {
  const mode = process.env.SOLANA_EPOCH_ID_MODE?.trim().toLowerCase();
  if (mode === "calendar") return false;
  if (mode === "sequential") return true;
  return true;
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
