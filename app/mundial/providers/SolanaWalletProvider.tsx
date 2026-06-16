"use client";

import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useStandardWalletAdapters } from "@solana/wallet-standard-wallet-adapter-react";
import { useMemo, type ReactNode } from "react";
import WalletConnectModal from "../ui/WalletConnectModal";
import { WalletModalProvider } from "./wallet-modal-context";

/**
 * Browser RPC goes through our same-origin proxy (/api/solana/rpc) to avoid the
 * public devnet endpoint's 403 origin blocking. Falls back to a relative path
 * during SSR where window is unavailable.
 */
function resolveRpcEndpoint(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/solana/rpc`;
  }
  return "/api/solana/rpc";
}

function WalletContextProvider({ children }: { children: ReactNode }) {
  const legacyAdapters = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    [],
  );

  const wallets = useStandardWalletAdapters(legacyAdapters);

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        {children}
        <WalletConnectModal />
      </WalletModalProvider>
    </WalletProvider>
  );
}

export default function SolanaWalletProvider({
  children,
}: {
  children: ReactNode;
}) {
  const endpoint = useMemo(() => resolveRpcEndpoint(), []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletContextProvider>{children}</WalletContextProvider>
    </ConnectionProvider>
  );
}
