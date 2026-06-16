"use client";

import {
  WalletReadyState,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { type Wallet, useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  copyPageUrl,
  isMobileDevice,
  openInPhantomBrowser,
  walletConnectionBlocked,
} from "../lib/mobile-browser";
import { useWalletModal } from "../providers/wallet-modal-context";
import styles from "./WalletConnectModal.module.css";

const FEATURED_WALLETS = [
  { id: "phantom", label: "Phantom", match: (name: string) => /phantom/i.test(name) },
  { id: "solflare", label: "Solflare", match: (name: string) => /solflare/i.test(name) },
  { id: "backpack", label: "Backpack", match: (name: string) => /backpack/i.test(name) },
  { id: "jupiter", label: "Jupiter", match: (name: string) => /jupiter/i.test(name) },
] as const;

const READY_STATE_ORDER: Record<WalletReadyState, number> = {
  [WalletReadyState.Installed]: 0,
  [WalletReadyState.Loadable]: 1,
  [WalletReadyState.NotDetected]: 2,
  [WalletReadyState.Unsupported]: 3,
};

function isFeaturedWallet(name: string): boolean {
  return FEATURED_WALLETS.some((f) => f.match(name));
}

function sortByReadyState(a: Wallet, b: Wallet): number {
  return READY_STATE_ORDER[a.readyState] - READY_STATE_ORDER[b.readyState];
}

function WalletRow({
  wallet,
  connecting,
  onSelect,
}: {
  wallet: Wallet;
  connecting: boolean;
  onSelect: (name: WalletName) => void;
}) {
  const { adapter, readyState } = wallet;
  const installed = readyState === WalletReadyState.Installed;

  return (
    <button
      type="button"
      className={styles.walletRow}
      disabled={connecting}
      onClick={() => onSelect(adapter.name)}
    >
      <span className={styles.walletIconWrap}>
        {adapter.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={adapter.icon}
            alt=""
            className={styles.walletIcon}
            width={40}
            height={40}
          />
        ) : (
          <span className={styles.walletIconFallback} aria-hidden>
            {adapter.name.charAt(0)}
          </span>
        )}
      </span>
      <span className={styles.walletInfo}>
        <span className={styles.walletName}>{adapter.name}</span>
        <span className={styles.walletStatus}>
          {installed
            ? "Detected"
            : readyState === WalletReadyState.Loadable
              ? "Tap to connect"
              : isMobileDevice()
                ? "Opens wallet app"
                : "Not installed"}
        </span>
      </span>
      <span className={styles.walletChevron} aria-hidden>
        →
      </span>
    </button>
  );
}

export default function WalletConnectModal() {
  const { visible, close } = useWalletModal();
  const { wallets, select, connect, connecting } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setCopied(false);
      return;
    }
    const refreshBlocked = () => setBlocked(walletConnectionBlocked());
    refreshBlocked();
    const intervalId = window.setInterval(refreshBlocked, 250);
    const stopId = window.setTimeout(() => window.clearInterval(intervalId), 2000);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(stopId);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [visible, close]);

  const { featured, others } = useMemo(() => {
    const featuredBuckets = FEATURED_WALLETS.map((spec) => {
      const match = wallets
        .filter((w) => spec.match(w.adapter.name))
        .sort(sortByReadyState);
      return { spec, wallet: match[0] ?? null };
    });

    const featuredList = featuredBuckets
      .filter(({ spec, wallet }) => spec.id !== "jupiter" || wallet)
      .map(({ wallet }) => wallet)
      .filter((w): w is Wallet => w !== null);

    const featuredNames = new Set(
      featuredList.map((w) => w.adapter.name),
    );

    const othersList = wallets
      .filter((w) => !featuredNames.has(w.adapter.name) && !isFeaturedWallet(w.adapter.name))
      .sort(sortByReadyState);

    return { featured: featuredList, others: othersList };
  }, [wallets]);

  const handleSelect = useCallback(
    async (walletName: WalletName) => {
      if (blocked) return;
      setError(null);
      try {
        select(walletName);
        await connect();
        close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not connect wallet";
        setError(message);
      }
    },
    [blocked, select, connect, close],
  );

  const handleCopyLink = async () => {
    const ok = await copyPageUrl();
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2500);
  };

  if (!visible) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
      >
        <header className={styles.header}>
          <h2 id="wallet-modal-title" className={styles.title}>
            Choose your wallet
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {blocked ? (
          <div className={styles.blocked}>
            <p className={styles.blockedTitle}>
              Open in Safari or your wallet&apos;s app
            </p>
            <p className={styles.blockedBody}>
              Wallet connection isn&apos;t available inside this in-app browser
              (e.g. X). Open Mundial in Safari, Chrome, or your wallet&apos;s
              in-app browser to connect.
            </p>
            <div className={styles.blockedActions}>
              <button
                type="button"
                className={styles.blockedPrimary}
                onClick={handleCopyLink}
              >
                {copied ? "Link copied" : "Copy link"}
              </button>
              <button
                type="button"
                className={styles.blockedSecondary}
                onClick={() => openInPhantomBrowser()}
              >
                Open in Phantom
              </button>
            </div>
          </div>
        ) : (
          <>
            {featured.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Featured</p>
                <div className={styles.walletList}>
                  {featured.map((wallet) => (
                    <WalletRow
                      key={wallet.adapter.name}
                      wallet={wallet}
                      connecting={connecting}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {others.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>More wallets</p>
                <div className={styles.walletList}>
                  {others.map((wallet) => (
                    <WalletRow
                      key={wallet.adapter.name}
                      wallet={wallet}
                      connecting={connecting}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {featured.length === 0 && others.length === 0 ? (
              <p className={styles.empty}>
                No Solana wallets detected. Install Phantom, Solflare, or
                another compatible wallet, then try again.
              </p>
            ) : null}
          </>
        )}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {connecting ? (
          <p className={styles.connecting}>Connecting…</p>
        ) : null}
      </div>
    </div>
  );
}
