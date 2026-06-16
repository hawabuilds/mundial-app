export type SolanaCluster = "devnet" | "mainnet-beta";

export function readPublicSolanaCluster(): SolanaCluster {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim().toLowerCase();
  if (explicit === "devnet" || explicit === "mainnet-beta") {
    return explicit;
  }

  const rpc =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    process.env.SOLANA_RPC_URL?.trim() ||
    "";
  if (rpc.includes("devnet") || process.env.SOLANA_CLUSTER === "devnet") {
    return "devnet";
  }

  return "mainnet-beta";
}

export function readPublicSolanaRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  if (explicit) return explicit;

  return readPublicSolanaCluster() === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";
}

export function solanaExplorerClusterParam(cluster: SolanaCluster): string {
  return cluster === "devnet" ? "?cluster=devnet" : "";
}
