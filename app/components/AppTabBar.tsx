"use client";



import { useTranslations } from "next-intl";

import {

  TabClaimIcon,

  TabMatchesIcon,

  TabRankIcon,

  TabWalletIcon,

} from "./TabIcons";

import styles from "./AppTabBar.module.css";



export type AppTab = "home" | "ranks" | "wallet" | "claim";



type AppTabBarProps = {

  activeTab: AppTab;

  onHome: () => void;

  onRanks: () => void;

  onWallet?: () => void;

  onClaim?: () => void;

  claimHighlight?: boolean;

};



const TAB_ICONS = {

  home: TabMatchesIcon,

  ranks: TabRankIcon,

  wallet: TabWalletIcon,

  claim: TabClaimIcon,

} as const;



export default function AppTabBar({

  activeTab,

  onHome,

  onRanks,

  onWallet,

  onClaim,

  claimHighlight = false,

}: AppTabBarProps) {

  const t = useTranslations("tabBar");



  const tabs: {

    id: AppTab;

    label: string;

    onClick?: () => void;

    disabled?: boolean;

    highlight?: boolean;

  }[] = [

    { id: "home", label: t("home"), onClick: onHome },

    { id: "ranks", label: t("ranks"), onClick: onRanks },

    { id: "wallet", label: t("wallet"), onClick: onWallet, disabled: !onWallet },

    {

      id: "claim",

      label: t("claim"),

      onClick: onClaim,

      disabled: !onClaim,

      highlight: claimHighlight,

    },

  ];



  return (

    <nav className={styles.tabbar} aria-label="Main">

      {tabs.map(({ id, label, onClick, disabled, highlight }) => {

        const Icon = TAB_ICONS[id];

        const isActive = activeTab === id;

        const tabClass = [

          styles.tab,

          isActive ? styles.tabActive : "",

          highlight && !isActive ? styles.tabHighlight : "",

        ]

          .filter(Boolean)

          .join(" ");



        return (

          <button

            key={id}

            type="button"

            className={tabClass}

            onClick={onClick}

            disabled={disabled}

            aria-current={isActive ? "page" : undefined}

          >

            <span className={styles.iconWrap}>

              <Icon className={styles.icon} />

              {highlight ? <span className={styles.badge} aria-hidden /> : null}

            </span>

            <span className={styles.label}>{label}</span>

          </button>

        );

      })}

    </nav>

  );

}

