/** Write little-endian u64 into a byte array (browser + Node). */
export function writeU64Le(
  target: Uint8Array,
  offset: number,
  value: bigint,
): void {
  const view = new DataView(
    target.buffer,
    target.byteOffset,
    target.byteLength,
  );
  view.setBigUint64(offset, value, true);
}

export function u64LeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  writeU64Le(out, 0, value);
  return out;
}
