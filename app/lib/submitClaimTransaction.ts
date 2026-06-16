import { config } from "@/app/wagmi";
import { scorePayoutAbi } from "@/lib/payoutContract";
import type { ClaimVoucherResponse } from "@/app/lib/claim-voucher-client";
import type { ClientPayoutConfig } from "@/app/lib/payout-config-client";
import { formatClaimError } from "@/app/lib/formatClaimError";
import {
  payoutChainLabel,
  resolvePayoutChainId,
} from "@/app/lib/payoutChainMeta";
import {
  getAccount,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import type { Address, Hex } from "viem";

type WagmiPayoutChainId = (typeof config)["chains"][number]["id"];

const RECEIPT_TIMEOUT_MS = 60_000;

function toWagmiChainId(chainId: number): WagmiPayoutChainId {
  const payoutChainId = resolvePayoutChainId(chainId);
  if (payoutChainId !== 97 && payoutChainId !== 56) {
    throw new Error(
      `Unsupported payout chain ${payoutChainId} — use BSC Testnet (97) or BSC (56)`,
    );
  }
  return payoutChainId;
}

function normalizeBytes32(value: string): Hex {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  return hex as Hex;
}

function normalizeSignature(value: string): Hex {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (hex.length !== 132) {
    throw new Error("Invalid claim signature from server — contact support");
  }
  return hex as Hex;
}

/** Call before voucher fetch so MetaMask network switch is separate from the claim tx. */
export async function ensurePayoutChainSelected(
  chainId: number,
): Promise<WagmiPayoutChainId> {
  const wagmiChainId = toWagmiChainId(chainId);
  const active = getAccount(config);

  if (!active.isConnected || !active.address) {
    throw new Error("Connect MetaMask on the Wallet tab first");
  }

  if (active.chainId === wagmiChainId) {
    return wagmiChainId;
  }

  await switchChain(config, { chainId: wagmiChainId });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (getAccount(config).chainId === wagmiChainId) {
      return wagmiChainId;
    }
  }

  throw new Error(
    `MetaMask must be on ${payoutChainLabel(wagmiChainId)} (chain ${wagmiChainId}). Switch network in MetaMask, then press Claim again.`,
  );
}

export type SubmitClaimPhase = "wallet-confirm" | "mining";

type SignedClaimVoucher = ClaimVoucherResponse & {
  voucherId: string;
  signature: string;
};

export async function submitClaimTransaction(
  params: {
    payout: ClientPayoutConfig;
    voucher: SignedClaimVoucher;
    account: Address;
    wagmiChainId: WagmiPayoutChainId;
  },
  onPhase?: (phase: SubmitClaimPhase) => void,
): Promise<Hex> {
  const { payout, voucher, account, wagmiChainId } = params;

  const args = [
    BigInt(voucher.epochId),
    voucher.to as Address,
    BigInt(voucher.amount),
    normalizeBytes32(voucher.voucherId),
    normalizeSignature(voucher.signature),
  ] as const;

  const active = getAccount(config);
  if (active.address?.toLowerCase() !== account.toLowerCase()) {
    throw new Error("Wallet address changed — refresh the page and try again");
  }

  if (active.chainId !== wagmiChainId) {
    throw new Error(
      `Wrong network in MetaMask — switch to ${payoutChainLabel(wagmiChainId)}, then press Claim again`,
    );
  }

  onPhase?.("wallet-confirm");

  const hash = await writeContract(config, {
    address: payout.contractAddress,
    abi: scorePayoutAbi,
    functionName: "claim",
    args,
    account,
    chainId: wagmiChainId,
  });

  onPhase?.("mining");

  try {
    await Promise.race([
      waitForTransactionReceipt(config, { hash, chainId: wagmiChainId }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Submitted ${hash.slice(0, 10)}… — open BscScan if the app is slow`,
              ),
            ),
          RECEIPT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (receiptErr) {
    const message =
      receiptErr instanceof Error ? receiptErr.message : String(receiptErr);
    if (message.includes("Submitted")) {
      return hash;
    }
    throw receiptErr;
  }

  return hash;
}

export function toClaimError(err: unknown): string {
  return formatClaimError(err);
}
