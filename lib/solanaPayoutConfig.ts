import { PublicKey } from "@solana/web3.js";

/** Placeholder until devnet deploy finishes; swap via env. */
export const PLACEHOLDER_MUNDIAL_REWARDS_PROGRAM_ID =
  "11111111111111111111111111111111";

export type SolanaPayoutConfig = {
  programId: PublicKey;
  usdcMint: PublicKey;
  rpcUrl: string;
  cluster: "devnet" | "mainnet-beta";
};

function parsePublicKey(
  raw: string | undefined,
  label: string,
): PublicKey | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana public key`);
  }
}

export function readSolanaPayoutConfig(): SolanaPayoutConfig | null {
  const programId = parsePublicKey(
    process.env.MUNDIAL_REWARDS_PROGRAM_ID?.trim() ||
      process.env.NEXT_PUBLIC_MUNDIAL_REWARDS_PROGRAM_ID?.trim(),
    "MUNDIAL_REWARDS_PROGRAM_ID",
  );
  const usdcMint = parsePublicKey(
    process.env.USDC_MINT?.trim() ||
      process.env.NEXT_PUBLIC_USDC_MINT?.trim(),
    "USDC_MINT",
  );
  const rpcUrl =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.devnet.solana.com";

  if (!programId || !usdcMint) return null;

  const cluster =
    rpcUrl.includes("devnet") || process.env.SOLANA_CLUSTER === "devnet"
      ? "devnet"
      : "mainnet-beta";

  return { programId, usdcMint, rpcUrl, cluster };
}

export function diagnoseSolanaPayoutConfig(): string | null {
  try {
    const config = readSolanaPayoutConfig();
    if (!config) {
      const missing: string[] = [];
      if (!process.env.MUNDIAL_REWARDS_PROGRAM_ID?.trim()) {
        missing.push("MUNDIAL_REWARDS_PROGRAM_ID");
      }
      if (!process.env.USDC_MINT?.trim()) {
        missing.push("USDC_MINT");
      }
      if (missing.length === 0) {
        return "Solana payout config is incomplete — check MUNDIAL_REWARDS_PROGRAM_ID and USDC_MINT";
      }
      return `Solana payout not configured — set ${missing.join(" and ")} (use placeholder program id until deploy finishes)`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid Solana payout config";
  }
}
