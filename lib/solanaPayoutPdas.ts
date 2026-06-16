import { PublicKey } from "@solana/web3.js";
import { u64LeBytes } from "@/lib/binaryLe";

export const CONFIG_SEED = new TextEncoder().encode("config");
export const VAULT_SEED = new TextEncoder().encode("vault");
export const EPOCH_SEED = new TextEncoder().encode("epoch");
export const CLAIM_SEED = new TextEncoder().encode("claim");

export function findConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

export function findVaultPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_SEED], programId)[0];
}

export function findEpochPda(
  programId: PublicKey,
  epochId: bigint,
): PublicKey {
  const epochBytes = u64LeBytes(epochId);
  return PublicKey.findProgramAddressSync(
    [EPOCH_SEED, epochBytes],
    programId,
  )[0];
}

export function findClaimMarkerPda(
  programId: PublicKey,
  voucherId: Uint8Array,
): PublicKey {
  if (voucherId.length !== 32) {
    throw new Error("voucher_id must be 32 bytes");
  }
  return PublicKey.findProgramAddressSync(
    [CLAIM_SEED, voucherId],
    programId,
  )[0];
}
