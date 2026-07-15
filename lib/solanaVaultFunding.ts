import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { getMint, mintTo } from "@solana/spl-token";
import { findVaultPda } from "@/lib/solanaPayoutPdas";
import { formatUsdcFromBaseUnits } from "@/lib/formatUsdc";
import { parseSolanaSecretKey } from "@/lib/solanaKeypair";

export type EnsureVaultUsdcResult =
  | { ok: true; minted: bigint; signature?: string; skipped: boolean }
  | { ok: false; reason: string };

/** Devnet-only: mint USDC into the rewards vault before snapshot/open. */
export function isSolanaAutoMintVaultEnabled(): boolean {
  const flag = process.env.SOLANA_AUTO_MINT_VAULT?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no" || flag === "off") {
    return false;
  }
  if (flag === "true" || flag === "1" || flag === "yes" || flag === "on") {
    return true;
  }
  // This app is Solana-devnet-only (see solanaPublicConfig). Default ON so
  // custom RPC URLs that omit the substring "devnet" still auto-fund.
  return true;
}

function readMintAuthorityKeypair(expected: PublicKey): Keypair | null {
  const candidates = [
    process.env.SOLANA_USDC_MINT_AUTHORITY_SECRET_KEY,
    process.env.SOLANA_ADMIN_SECRET_KEY,
    process.env.SOLANA_OPERATOR_SECRET_KEY,
  ];
  for (const raw of candidates) {
    const secret = parseSolanaSecretKey(raw?.trim());
    if (!secret) continue;
    const keypair = Keypair.fromSecretKey(secret);
    if (keypair.publicKey.equals(expected)) return keypair;
  }
  return null;
}

export async function ensureVaultUsdcForEpoch(params: {
  connection: Connection;
  programId: PublicKey;
  usdcMint: PublicKey;
  requiredPot: bigint;
  availablePot: bigint;
}): Promise<EnsureVaultUsdcResult> {
  if (!isSolanaAutoMintVaultEnabled()) {
    return { ok: true, minted: 0n, skipped: true };
  }

  const shortfall = params.requiredPot - params.availablePot;
  if (shortfall <= 0n) {
    return { ok: true, minted: 0n, skipped: true };
  }

  let onChainMintAuthority: PublicKey | null;
  try {
    const mintInfo = await getMint(
      params.connection,
      params.usdcMint,
      "confirmed",
    );
    onChainMintAuthority = mintInfo.mintAuthority;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Could not read USDC mint";
    return { ok: false, reason: `USDC mint lookup failed: ${reason}` };
  }

  if (!onChainMintAuthority) {
    return {
      ok: false,
      reason: "USDC mint authority is revoked — cannot auto-mint devnet USDC",
    };
  }

  const mintAuthority = readMintAuthorityKeypair(onChainMintAuthority);
  if (!mintAuthority) {
    return {
      ok: false,
      reason: `Auto-mint needs the USDC mint authority key (${onChainMintAuthority.toBase58()}) — set SOLANA_USDC_MINT_AUTHORITY_SECRET_KEY or SOLANA_ADMIN_SECRET_KEY`,
    };
  }

  const vaultPda = findVaultPda(params.programId);
  try {
    const signature = await mintTo(
      params.connection,
      mintAuthority,
      params.usdcMint,
      vaultPda,
      mintAuthority.publicKey,
      shortfall,
    );
    return { ok: true, minted: shortfall, signature, skipped: false };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "mintTo transaction failed";
    return {
      ok: false,
      reason: `Failed to mint ${formatUsdcFromBaseUnits(shortfall)} USDC into vault: ${reason}`,
    };
  }
}
