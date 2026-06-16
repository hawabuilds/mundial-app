"use client";

import { useLinkPayoutWallet } from "@/app/lib/useLinkPayoutWallet";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";
import styles from "./Dashboard.module.css";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function NavWalletControl() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tw = useTranslations("wallet");
  const { address, isConnected, isConnecting } = useAccount();
  useLinkPayoutWallet({ showLinkedState: false });
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  if (isConnected && address) {
    return (
      <button
        type="button"
        className={styles.walletAccountPill}
        onClick={() => openAccountModal?.()}
        aria-label={t("walletAccount")}
      >
        <span className={styles.cbadgeDot} aria-hidden />
        <span className={styles.walletAddress}>
          {shortenAddress(address)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.walletConnectBtn}
      onClick={() => openConnectModal?.()}
      disabled={isConnecting}
      aria-label={t("connectWallet")}
    >
      {isConnecting ? tc("connecting") : tw("connectWallet")}
    </button>
  );
}
