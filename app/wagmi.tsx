'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { PAYOUT_CHAIN, PAYOUT_CHAIN_ID, BSC_TESTNET_CHAIN_ID } from './lib/payoutConfig';
import { http } from 'wagmi';

const payoutTransport =
  PAYOUT_CHAIN_ID === BSC_TESTNET_CHAIN_ID
    ? http('https://data-seed-prebsc-1-s1.binance.org:8545')
    : http('https://bsc-dataseed.binance.org');

export const config = getDefaultConfig({
  appName: 'Mundial',
  projectId: '42cedd42ee3f029a1efbff1b26216ca0',
  chains: [PAYOUT_CHAIN],
  transports: {
    [PAYOUT_CHAIN.id]: payoutTransport,
  },
  wallets: [
    {
      groupName: 'Recommended',
      wallets: [injectedWallet, metaMaskWallet],
    },
    {
      groupName: 'Mobile (scan QR)',
      wallets: [walletConnectWallet],
    },
  ],
  ssr: true,
});
