/** Copa Mundial runs on Solana devnet only. */
export type SolanaCluster = "devnet";

export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const SOLANA_NETWORK_LABEL = "Devnet";

export function readPublicSolanaCluster(): SolanaCluster {
  return "devnet";
}

export function readServerSolanaCluster(): SolanaCluster {
  return "devnet";
}

function pickDevnetRpcUrl(
  ...candidates: Array<string | undefined>
): string {
  for (const raw of candidates) {
    const url = raw?.trim();
    if (url && url.includes("devnet")) return url;
  }
  return SOLANA_DEVNET_RPC;
}

/** Client-safe devnet RPC (ignores misconfigured non-devnet URLs). */
export function readPublicSolanaRpcUrl(): string {
  return pickDevnetRpcUrl(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
}

/** Server RPC for claim voucher + JSON-RPC proxy. */
export function readServerSolanaRpcUrl(): string {
  return pickDevnetRpcUrl(
    process.env.SOLANA_RPC_URL,
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  );
}

export function solanaExplorerClusterParam(_cluster?: SolanaCluster): string {
  return "?cluster=devnet";
}
