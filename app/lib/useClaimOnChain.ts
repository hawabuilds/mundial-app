"use client";

import { claimPayoutVoucher } from "@/app/lib/claim-voucher-client";
import { linkPayoutWallet } from "@/app/lib/link-wallet-client";
import { fetchLinkedPayoutWallet } from "@/app/lib/payout-wallet-client";
import {
  ensurePayoutChainSelected,
  submitClaimTransaction,
  toClaimError,
  type SubmitClaimPhase,
} from "@/app/lib/submitClaimTransaction";
import { resolveClientPayoutConfig } from "@/app/lib/payout-config-client";
import { PAYOUT_CHAIN } from "@/app/lib/payoutConfig";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";

export type ClaimOnChainStatus =
  | "idle"
  | "voucher"
  | "switch"
  | "wallet-confirm"
  | "mining"
  | "success"
  | "error";

async function ensureWalletLinkedForPayout(address: Address): Promise<void> {
  const normalized = address.toLowerCase();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { linkedWallet } = await fetchLinkedPayoutWallet();
    if (linkedWallet?.toLowerCase() === normalized) {
      return;
    }
    if (attempt === 0) {
      await linkPayoutWallet(address);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(
    "This wallet is still being linked — open the Wallet tab, wait a few seconds, then try Claim again",
  );
}

function phaseToStatus(phase: SubmitClaimPhase): ClaimOnChainStatus {
  switch (phase) {
    case "wallet-confirm":
      return "wallet-confirm";
    case "mining":
      return "mining";
    default:
      return "wallet-confirm";
  }
}

export function useClaimOnChain() {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<ClaimOnChainStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();

  const claimEpoch = useCallback(
    async (
      epochId: string,
    ): Promise<{
      ok: boolean;
      error?: string;
      txHash?: Hex;
      chainId?: number;
      amountBnb?: number;
      alreadyClaimed?: boolean;
    }> => {
      if (!isConnected || !address) {
        const message = "Connect your wallet on the Wallet tab first";
        setError(message);
        setStatus("error");
        return { ok: false, error: message };
      }

      const payout = await resolveClientPayoutConfig();
      if (!payout) {
        const message =
          "Payout contract not configured — set PAYOUT_CONTRACT_ADDRESS and PAYOUT_CHAIN_ID";
        setError(message);
        setStatus("error");
        return { ok: false, error: message };
      }

      setError(null);
      setTxHash(undefined);

      let amountBnb: number | undefined;

      try {
        setStatus("switch");
        const wagmiChainId = await ensurePayoutChainSelected(payout.chainId);

        setStatus("voucher");
        await ensureWalletLinkedForPayout(address as Address);
        const voucher = await claimPayoutVoucher(epochId, address);
        amountBnb = Number(BigInt(voucher.amount)) / 1e18;

        if (voucher.alreadyClaimed) {
          setStatus("success");
          return {
            ok: true,
            chainId: payout.chainId,
            amountBnb,
            alreadyClaimed: true,
          };
        }

        if (!voucher.signature || !voucher.voucherId) {
          throw new Error("Invalid claim voucher from server");
        }

        const hash = await submitClaimTransaction(
          {
            payout,
            voucher: {
              epochId: voucher.epochId,
              to: voucher.to,
              amount: voucher.amount,
              voucherId: voucher.voucherId,
              signature: voucher.signature,
              rank: voucher.rank,
            },
            account: address as Address,
            wagmiChainId,
          },
          (phase) => setStatus(phaseToStatus(phase)),
        );

        setTxHash(hash);
        setStatus("success");
        return {
          ok: true,
          txHash: hash,
          chainId: payout.chainId,
          amountBnb,
        };
      } catch (err) {
        const message = toClaimError(err);
        if (
          amountBnb !== undefined &&
          /voucher used|already claimed/i.test(message)
        ) {
          setError(null);
          setStatus("success");
          return {
            ok: true,
            chainId: payout.chainId,
            amountBnb,
            alreadyClaimed: true,
          };
        }
        setError(message);
        setStatus("error");
        return { ok: false, error: message };
      }
    },
    [address, isConnected],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(undefined);
  }, []);

  const busy =
    status === "voucher" ||
    status === "switch" ||
    status === "wallet-confirm" ||
    status === "mining";

  return {
    claimEpoch,
    reset,
    status,
    error,
    txHash,
    busy,
    payoutChain: PAYOUT_CHAIN,
  };
}
