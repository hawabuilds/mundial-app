"use client";



import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import AppTabBar, { type AppTab } from "./AppTabBar";

import NavUserControl from "./NavUserControl";

import styles from "./AppShell.module.css";



type AppShellProps = {

  activeTab: AppTab;

  onHome: () => void;

  onRanks: () => void;

  onWallet?: () => void;

  onClaim?: () => void;

  claimHighlight?: boolean;

  children: ReactNode;

};



const TITLE_KEYS: Record<AppTab, "home" | "ranks" | "wallet" | "claim"> = {

  home: "home",

  ranks: "ranks",

  wallet: "wallet",

  claim: "claim",

};



export default function AppShell({

  activeTab,

  onHome,

  onRanks,

  onWallet,

  onClaim,

  claimHighlight = false,

  children,

}: AppShellProps) {

  const t = useTranslations("tabBar");



  return (

    <div className={styles.app}>

      <header className={styles.header}>

        <div className={styles.headerRow}>

          <div className={styles.headerTitles}>

            <span className={styles.brand}>Mundial</span>

            <h1 className={styles.screenTitle}>{t(TITLE_KEYS[activeTab])}</h1>

          </div>

          <NavUserControl />

        </div>

      </header>



      <main className={styles.main}>{children}</main>



      <footer className={styles.footer}>

        <AppTabBar

          activeTab={activeTab}

          onHome={onHome}

          onRanks={onRanks}

          onWallet={onWallet}

          onClaim={onClaim}

          claimHighlight={claimHighlight}

        />

      </footer>

    </div>

  );

}

