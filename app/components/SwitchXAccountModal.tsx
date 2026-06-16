"use client";

import { useTranslations } from "next-intl";
import { DM_Mono, Figtree } from "next/font/google";
import {
  openXAccountSwitch,
  signInWithX,
  signInWithXAfterSwitch,
} from "../lib/auth-client";
import styles from "./SwitchXAccountModal.module.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-figtree",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

type SwitchXAccountModalProps = {
  open: boolean;
  onClose: () => void;
  signedIn?: boolean;
};

export default function SwitchXAccountModal({
  open,
  onClose,
  signedIn = false,
}: SwitchXAccountModalProps) {
  const t = useTranslations("switchXAccount");
  const tc = useTranslations("common");

  if (!open) return null;

  const handleContinue = () => {
    onClose();
    if (signedIn) {
      void signInWithXAfterSwitch();
      return;
    }
    void signInWithX();
  };

  return (
    <div
      className={`${styles.modalBg} ${figtree.variable} ${dmMono.variable} ${styles.modalBgOpen}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modalSheet}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-x-title"
      >
        <div className={styles.modalHandle} />
        <h2 id="switch-x-title" className={styles.modalTitle}>
          {t("title")}
        </h2>
        <p className={styles.modalBody}>{t("body")}</p>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={openXAccountSwitch}
        >
          {t("openX")}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleContinue}
        >
          {t("continueSignIn")}
        </button>
        <button type="button" className={styles.btnCancel} onClick={onClose}>
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}
