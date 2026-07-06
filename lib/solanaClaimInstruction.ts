import { sha256 } from "@noble/hashes/sha2.js";
import { writeU64Le } from "@/lib/binaryLe";

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function anchorGlobalDiscriminator(ixName: string): Uint8Array {
  const preimage = new TextEncoder().encode(`global:${ixName}`);
  return sha256(preimage).slice(0, 8);
}

export function encodeClaimInstructionData(
  epochId: bigint,
  amount: bigint,
  voucherId: Uint8Array,
): Uint8Array {
  if (voucherId.length !== 32) {
    throw new Error("voucher_id must be 32 bytes");
  }
  const data = new Uint8Array(8 + 8 + 8 + 32);
  data.set(anchorGlobalDiscriminator("claim"), 0);
  writeU64Le(data, 8, epochId);
  writeU64Le(data, 16, amount);
  data.set(voucherId, 24);
  return data;
}
