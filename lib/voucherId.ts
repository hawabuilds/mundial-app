import { keccak_256 } from "@noble/hashes/sha3.js";

/** EVM-compatible keccak256(abi.encodePacked(uint256, string)) for voucher ids. */
export function computeVoucherId(epochId: bigint, userId: string): `0x${string}` {
  const epochBytes = new Uint8Array(32);
  let v = epochId;
  for (let i = 31; i >= 0; i -= 1) {
    epochBytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  const strBytes = new TextEncoder().encode(userId);
  const packed = new Uint8Array(32 + strBytes.length);
  packed.set(epochBytes, 0);
  packed.set(strBytes, 32);
  return `0x${Buffer.from(keccak_256(packed)).toString("hex")}`;
}
