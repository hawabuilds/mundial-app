import { sha256, hexToBytes } from "viem";
import { writeU64Le } from "@/lib/binaryLe";

export function anchorGlobalDiscriminator(ixName: string): Uint8Array {
  const preimage = new TextEncoder().encode(`global:${ixName}`);
  return hexToBytes(sha256(preimage)).slice(0, 8);
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
