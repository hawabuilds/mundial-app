import { getAddress, isAddress } from "viem";

/** Validate and normalize to EIP-55 checksum form. */
export function parseWalletAddress(raw: unknown): `0x${string}` | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}
