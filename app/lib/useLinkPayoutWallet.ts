"use client";

import { linkPayoutWallet } from "@/app/lib/link-wallet-client";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

export type PayoutWalletLinkStatus = "idle" | "linking" | "linked" | "error";

type Options = {
  /** When false, link silently (e.g. nav connect). Default true. */
  showLinkedState?: boolean;
};

export function useLinkPayoutWallet(options: Options = {}) {
  const { showLinkedState = true } = options;
  const { status } = useSession();
  const { address, isConnected } = useAccount();
  const [linkStatus, setLinkStatus] = useState<PayoutWalletLinkStatus>("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const lastLinkedAddress = useRef<string | null>(null);
  const failedAddress = useRef<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    if (status !== "authenticated" || !isConnected || !address) {
      if (!isConnected) {
        lastLinkedAddress.current = null;
        failedAddress.current = null;
      }
      setLinkStatus("idle");
      setLinkError(null);
      return;
    }

    const normalized = address.toLowerCase();
    if (
      lastLinkedAddress.current === normalized ||
      failedAddress.current === normalized
    ) {
      return;
    }

    let cancelled = false;
    setLinkStatus("linking");
    setLinkError(null);

    void linkPayoutWallet(address)
      .then(() => {
        if (cancelled) return;
        lastLinkedAddress.current = normalized;
        failedAddress.current = null;
        setLinkError(null);
        setLinkStatus(showLinkedState ? "linked" : "idle");
      })
      .catch((err) => {
        if (cancelled) return;
        failedAddress.current = normalized;
        setLinkError(
          err instanceof Error ? err.message : "Failed to link payout wallet",
        );
        setLinkStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [status, isConnected, address, showLinkedState, retryToken]);

  useEffect(() => {
    if (linkStatus !== "linked") return;
    const timer = window.setTimeout(() => setLinkStatus("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [linkStatus]);

  const retryLink = () => {
    if (!address) return;
    failedAddress.current = null;
    lastLinkedAddress.current = null;
    setLinkError(null);
    setRetryToken((n) => n + 1);
  };

  return { linkStatus, linkError, retryLink };
}
