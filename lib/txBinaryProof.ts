/** Normalise TxLINE proof binary fields (devnet JSON byte arrays or base64 strings). */

const BINARY_BYTE_LENGTH = 32;

export function normalizeBinaryField(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value.length === BINARY_BYTE_LENGTH ? value : null;
  }
  if (Array.isArray(value)) {
    if (!value.every((byte) => typeof byte === "number" && byte >= 0 && byte <= 255)) {
      return null;
    }
    const bytes = Uint8Array.from(value);
    return bytes.length === BINARY_BYTE_LENGTH ? bytes : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const bytes = trimmed.startsWith("0x")
        ? Uint8Array.from(Buffer.from(trimmed.slice(2), "hex"))
        : Uint8Array.from(Buffer.from(trimmed, "base64"));
      return bytes.length === BINARY_BYTE_LENGTH ? bytes : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function binaryFieldToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function binaryFieldFromBase64(value: string): Uint8Array {
  const bytes = normalizeBinaryField(value);
  if (!bytes) {
    throw new Error("Expected base64-encoded 32-byte field");
  }
  return bytes;
}

export function isBinaryField(value: unknown): boolean {
  return normalizeBinaryField(value) !== null;
}
