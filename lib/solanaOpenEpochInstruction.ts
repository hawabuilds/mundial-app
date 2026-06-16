import { anchorGlobalDiscriminator } from "@/lib/solanaClaimInstruction";
import { writeU64Le } from "@/lib/binaryLe";

export function encodeOpenEpochInstructionData(
  epochId: bigint,
  pot: bigint,
): Uint8Array {
  const data = new Uint8Array(8 + 8 + 8);
  data.set(anchorGlobalDiscriminator("open_epoch"), 0);
  writeU64Le(data, 8, epochId);
  writeU64Le(data, 16, pot);
  return data;
}
