'use client';

import * as React from "react";
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { config } from './wagmi';
import { AppChrome } from './components/AppChrome';
import { I18nProvider } from './components/I18nProvider';

const queryClient = new QueryClient();

export function Providers({
  children,
  copaMundialHost = false,
}: {
  children: React.ReactNode;
  copaMundialHost?: boolean;
}) {
  return (
    <SessionProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <I18nProvider>
              <AppChrome copaMundialHost={copaMundialHost}>{children}</AppChrome>
            </I18nProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}
