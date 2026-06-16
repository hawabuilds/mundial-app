"use client";

import { getAddress, type Address } from "viem";
import { bsc, bscTestnet } from "wagmi/chains";
import {
  BSC_MAINNET_CHAIN_ID,
  BSC_TESTNET_CHAIN_ID,
  resolvePayoutChainId,
} from "./payoutChainMeta";

export const PAYOUT_CHAIN_ID = resolvePayoutChainId();

export const PAYOUT_CHAIN =
  PAYOUT_CHAIN_ID === BSC_TESTNET_CHAIN_ID ? bscTestnet : bsc;

export { BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID };

export function getPayoutContractAddress(): Address | null {
  const raw = process.env.NEXT_PUBLIC_PAYOUT_CONTRACT_ADDRESS?.trim();
  if (!raw) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}
