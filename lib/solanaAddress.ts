import { PublicKey } from "@solana/web3.js";

/** Validate and normalize a Solana base58 public key. */
export function parseSolanaAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    return null;
  }
}
