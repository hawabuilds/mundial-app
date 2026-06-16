/** JSON.stringify replacer — BigInt values become decimal strings. */
export function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, jsonBigIntReplacer)) as T;
}
