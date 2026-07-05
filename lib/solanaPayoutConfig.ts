import { PublicKey } from "@solana/web3.js";
import { readServerSolanaRpcUrl } from "./solanaPublicConfig";

/** Matches declare_id! placeholder in solana-program until Playground deploy. */
export const PLACEHOLDER_MUNDIAL_REWARDS_PROGRAM_ID =
  "REPLACE_WITH_DEVNET_PROGRAM_ID";

/** Legacy placeholder still present in some .env files. */
const LEGACY_PLACEHOLDER_MUNDIAL_REWARDS_PROGRAM_ID =
  "11111111111111111111111111111111";

export type SolanaPayoutConfig = {
  programId: PublicKey;
  usdcMint: PublicKey;
  rpcUrl: string;
  cluster: "devnet";
};

function parsePublicKey(raw: string, label: string): PublicKey {
  try {
    return new PublicKey(raw);
  } catch {
    throw new Error(`${label} is not a valid Solana public key`);
  }
}

export function isPlaceholderProgramId(raw: string | undefined): boolean {
  const value = raw?.trim();
  if (!value) return true;
  return (
    value === PLACEHOLDER_MUNDIAL_REWARDS_PROGRAM_ID ||
    value === LEGACY_PLACEHOLDER_MUNDIAL_REWARDS_PROGRAM_ID
  );
}

function requireProgramIdEnv(): string {
  const raw = process.env.MUNDIAL_REWARDS_PROGRAM_ID?.trim();
  if (!raw) {
    throw new Error(
      "MUNDIAL_REWARDS_PROGRAM_ID is not set — set it to the deployed devnet program ID from Solana Playground",
    );
  }
  if (isPlaceholderProgramId(raw)) {
    throw new Error(
      "MUNDIAL_REWARDS_PROGRAM_ID is still the placeholder — replace it with the deployed devnet program ID from Solana Playground",
    );
  }
  return raw;
}

export function readSolanaPayoutConfig(): SolanaPayoutConfig {
  const programId = parsePublicKey(
    requireProgramIdEnv(),
    "MUNDIAL_REWARDS_PROGRAM_ID",
  );

  const usdcMintRaw =
    process.env.USDC_MINT?.trim() ||
    process.env.NEXT_PUBLIC_USDC_MINT?.trim();
  if (!usdcMintRaw) {
    throw new Error("USDC_MINT is not set");
  }
  const usdcMint = parsePublicKey(usdcMintRaw, "USDC_MINT");

  return {
    programId,
    usdcMint,
    rpcUrl: readServerSolanaRpcUrl(),
    cluster: "devnet",
  };
}

export function diagnoseSolanaPayoutConfig(): string | null {
  try {
    readSolanaPayoutConfig();
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid Solana payout config";
  }
}
