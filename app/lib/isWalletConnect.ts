/** True when the active wallet connection is WalletConnect (QR / mobile app). */
export function isWalletConnectConnector(
  connectorId?: string,
  connectorName?: string,
): boolean {
  const label = `${connectorId ?? ""} ${connectorName ?? ""}`.toLowerCase();
  return label.includes("walletconnect") || label.includes("wallet connect");
}

/** Strip noisy URIs from wallet errors shown in the UI. */
export function sanitizeWalletMessage(message: string): string {
  return message
    .replace(/wc:[a-zA-Z0-9@?&=_.%-]+/gi, "[wallet link]")
    .replace(/0x[a-fA-F0-9]{40,}/g, (match) =>
      match.length > 14 ? `${match.slice(0, 8)}…${match.slice(-4)}` : match,
    )
    .replace(/\s+/g, " ")
    .trim();
}
