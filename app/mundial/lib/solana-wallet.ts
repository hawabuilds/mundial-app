"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

export function useSolanaWallet() {
  const { publicKey, connecting, connected, disconnect } = useWallet();
  const { connection } = useConnection();
  const [balanceSol, setBalanceSol] = useState<number | null>(null);

  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!address) {
      setBalanceSol(null);
      return;
    }
    let cancelled = false;
    void connection
      .getBalance(new PublicKey(address))
      .then((lamports) => {
        if (!cancelled) setBalanceSol(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        if (!cancelled) setBalanceSol(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, connection]);

  return {
    address,
    balanceSol,
    connecting,
    isConnected: connected,
    disconnect,
  };
}

export function shortenSolanaAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
