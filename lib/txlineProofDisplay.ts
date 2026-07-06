import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getTxoddsOrigin } from "./txoddsOrigin";

/** Devnet vs production TxOracle program IDs (Program Addresses doc). */
export function txOracleProgramId(origin?: string): PublicKey {
  const host = (origin ?? getTxoddsOrigin()).toLowerCase();
  const devnet = host.includes("devnet") || host.includes("txline-dev");
  return new PublicKey(
    devnet
      ? "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
      : "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
  );
}

/** daily_scores_roots PDA for a batch min timestamp (On-Chain Validation + Program Addresses). */
export function dailyScoresMerkleRootsPda(
  minTimestampMs: number,
  origin?: string,
): PublicKey {
  const epochDay = Math.floor(minTimestampMs / (24 * 60 * 60 * 1000));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    txOracleProgramId(origin),
  );
  return pda;
}

export function solanaExplorerAddressUrl(
  address: string,
  _origin?: string,
): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
