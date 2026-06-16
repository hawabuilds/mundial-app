import { encodePacked, getAddress, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readPublicPayoutConfig } from "@/lib/payoutContract";

export function computeVoucherId(epochId: bigint, userId: string): Hex {
  return keccak256(encodePacked(["uint256", "string"], [epochId, userId]));
}

export function computeVoucherInnerHash(params: {
  contractAddress: Address;
  chainId: bigint;
  epochId: bigint;
  to: Address;
  amount: bigint;
  voucherId: Hex;
}): Hex {
  return keccak256(
    encodePacked(
      ["address", "uint256", "uint256", "address", "uint256", "bytes32"],
      [
        getAddress(params.contractAddress),
        params.chainId,
        params.epochId,
        getAddress(params.to),
        params.amount,
        params.voucherId,
      ],
    ),
  );
}

export async function signVoucherInner(
  inner: Hex,
  privateKey: Hex,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  return account.signMessage({ message: { raw: inner } });
}

export type PayoutSignerEnv = {
  privateKey: Hex;
  contractAddress: Address;
  chainId: bigint;
};

function readSignerPrivateKey(): Hex | null {
  const rawKey = process.env.SIGNER_PRIVATE_KEY?.trim();
  if (!rawKey) return null;

  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) return null;

  return privateKey;
}

/** Explains missing server env for claim vouchers (safe to show in API errors). */
export function diagnosePayoutSignerEnv(): string | null {
  const privateKey = readSignerPrivateKey();
  if (!privateKey) {
    const raw = process.env.SIGNER_PRIVATE_KEY?.trim();
    if (!raw) {
      return "SIGNER_PRIVATE_KEY is not set on the server (add it in Vercel → Settings → Environment Variables; never use NEXT_PUBLIC_ for this)";
    }
    return "SIGNER_PRIVATE_KEY is invalid (expected 64 hex chars, optional 0x prefix)";
  }

  const payout = readPublicPayoutConfig();
  if (!payout) {
    return "Payout contract is not configured — set PAYOUT_CONTRACT_ADDRESS and PAYOUT_CHAIN_ID (or NEXT_PUBLIC_* equivalents) on the server";
  }

  return null;
}

export function readPayoutSignerEnv(): PayoutSignerEnv | null {
  const privateKey = readSignerPrivateKey();
  const payout = readPublicPayoutConfig();
  if (!privateKey || !payout) return null;

  return {
    privateKey,
    contractAddress: payout.contractAddress,
    chainId: payout.chainId,
  };
}
