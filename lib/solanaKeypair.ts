import type { Hex } from "viem";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function hexToBytes(hex: Hex): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function decodeBase58(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error("invalid base58");
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeros = 0;
  for (const char of input) {
    if (char === "1") leadingZeros += 1;
    else break;
  }

  const decoded = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    decoded[decoded.length - 1 - i] = bytes[i]!;
  }
  return decoded;
}

/** 64-byte Solana keypair secret (seed + pubkey) from env. */
export function parseSolanaSecretKey(raw: string | undefined): Uint8Array | null {
  const value = raw?.trim();
  if (!value) return null;

  if (value.startsWith("[")) {
    let parsed: number[];
    try {
      parsed = JSON.parse(value) as number[];
    } catch {
      throw new Error(
        "Solana secret key must be a JSON array of 64 bytes (run npm run gen:solana-keys) — check SOLANA_SIGNER_SECRET_KEY on Vercel",
      );
    }
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      throw new Error("Solana secret key JSON must be a 64-byte array");
    }
    return Uint8Array.from(parsed);
  }

  try {
    const decoded = decodeBase58(value);
    if (decoded.length === 64) return decoded;
  } catch {
    // fall through
  }

  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (/^[0-9a-fA-F]{128}$/.test(hex)) {
    return hexToBytes(`0x${hex}` as Hex);
  }

  throw new Error(
    "Solana secret key must be JSON [64 bytes], base58 keypair, or 128-char hex",
  );
}

export function secretKeyToEnvJson(secretKey: Uint8Array): string {
  if (secretKey.length !== 64) {
    throw new Error("secret key must be 64 bytes");
  }
  return JSON.stringify(Array.from(secretKey));
}
