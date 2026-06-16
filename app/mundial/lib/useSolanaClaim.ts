"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useState } from "react";
import { fetchSolanaClaimVoucher } from "@/app/lib/solana-claim-voucher-client";
import { submitSolanaClaimTransaction } from "@/app/lib/submitSolanaClaimTransaction";

export function useSolanaClaim(usdcMint: string | null) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [claimingEpochId, setClaimingEpochId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const claimEpoch = useCallback(
    async (epochId: string) => {
      if (!connected || !publicKey || !signTransaction) {
        throw new Error("Connect your Solana wallet first");
      }
      if (!usdcMint) {
        throw new Error("USDC mint is not configured");
      }

      setClaimingEpochId(epochId);
      setClaimError(null);
      setLastSignature(null);

      try {
        const owner = publicKey.toBase58();
        const recipientToken = getAssociatedTokenAddressSync(
          new PublicKey(usdcMint),
          publicKey,
        ).toBase58();

        const voucher = await fetchSolanaClaimVoucher({
          epochId,
          owner,
          recipientToken,
        });

        const signature = await submitSolanaClaimTransaction({
          voucher,
          connection,
          payer: publicKey,
          signTransaction,
        });

        setLastSignature(signature);
        return signature;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Claim failed — try again";
        setClaimError(message);
        throw error;
      } finally {
        setClaimingEpochId(null);
      }
    },
    [connected, publicKey, signTransaction, usdcMint, connection],
  );

  return {
    claimEpoch,
    claimingEpochId,
    claimError,
    lastSignature,
    clearClaimError: () => setClaimError(null),
  };
}
