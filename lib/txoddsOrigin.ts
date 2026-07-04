/** Client-safe TxLINE API host (no node:fs — safe for browser bundles). */
export function getTxoddsOrigin(): string {
  return (process.env.TXODDS_API_ORIGIN?.trim() || "https://txline-dev.txodds.com").replace(
    /\/$/,
    "",
  );
}
