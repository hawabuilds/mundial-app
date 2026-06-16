export const BSC_MAINNET_CHAIN_ID = 56;
export const BSC_TESTNET_CHAIN_ID = 97;

export function resolvePayoutChainId(chainId?: number): number {
  if (chainId === BSC_TESTNET_CHAIN_ID || chainId === BSC_MAINNET_CHAIN_ID) {
    return chainId;
  }

  const raw = Number(
    process.env.NEXT_PUBLIC_PAYOUT_CHAIN_ID ??
      process.env.PAYOUT_CHAIN_ID ??
      String(BSC_MAINNET_CHAIN_ID),
  );

  return raw === BSC_TESTNET_CHAIN_ID
    ? BSC_TESTNET_CHAIN_ID
    : BSC_MAINNET_CHAIN_ID;
}

export function isPayoutTestnet(chainId?: number): boolean {
  return resolvePayoutChainId(chainId) === BSC_TESTNET_CHAIN_ID;
}

export function payoutChainLabel(chainId?: number): string {
  return isPayoutTestnet(chainId) ? "BSC Testnet" : "BNB Smart Chain";
}

export function payoutNativeSymbol(chainId?: number): string {
  return isPayoutTestnet(chainId) ? "tBNB" : "BNB";
}
