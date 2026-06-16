"use client";

import { linkPayoutWallet } from "@/app/lib/link-wallet-client";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useSolanaWallet } from "./solana-wallet";

export type SolanaLinkStatus = "idle" | "linking" | "linked" | "error";

export function useLinkSolanaPayoutWallet() {
  const { status } = useSession();
  const { address, isConnected } = useSolanaWallet();
  const [linkStatus, setLinkStatus] = useState<SolanaLinkStatus>("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
  const lastLinked = useRef<string | null>(null);
  const failed = useRef<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (status === "loading") return;

    if (status !== "authenticated" || !isConnected || !address) {
      if (!isConnected) {
        lastLinked.current = null;
        failed.current = null;
      }
      setLinkStatus("idle");
      setLinkError(null);
      return;
    }

    if (lastLinked.current === address || failed.current === address) return;

    let cancelled = false;
    setLinkStatus("linking");
    setLinkError(null);

    void linkPayoutWallet(address)
      .then(() => {
        if (cancelled) return;
        lastLinked.current = address;
        failed.current = null;
        setLinkStatus("linked");
      })
      .catch((err) => {
        if (cancelled) return;
        failed.current = address;
        const message =
          err instanceof Error ? err.message : "Failed to link payout wallet";
        const softFail =
          message.includes("leaderboard") ||
          message.includes("Could not verify your X account") ||
          message.includes("Sign in with X first");
        if (softFail) {
          setLinkStatus("idle");
          setLinkError(null);
          return;
        }
        setLinkError(message);
        setLinkStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [status, isConnected, address, retryToken]);

  useEffect(() => {
    if (linkStatus !== "linked") return;
    const t = window.setTimeout(() => setLinkStatus("idle"), 4000);
    return () => window.clearTimeout(t);
  }, [linkStatus]);

  const retryLink = () => {
    if (!address) return;
    failed.current = null;
    lastLinked.current = null;
    setRetryToken((n) => n + 1);
  };

  return { linkStatus, linkError, retryLink };
}

export async function fetchLinkedPayoutWallet(): Promise<string | null> {
  const response = await fetch("/api/me/payout-wallet", { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { linkedWallet?: string | null };
  return data.linkedWallet ?? null;
}
