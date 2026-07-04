"use client";

import type { ReactNode } from "react";
import BrandMark from "./BrandMark";
import TxLineCredit from "./TxLineCredit";
import styles from "./TabBar.module.css";

export type TabId = "fixtures" | "standings" | "call" | "vault";

type TabBarProps = {
  active: TabId;
  onChange: (tab: TabId) => void;
  vaultDot?: boolean;
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={styles.icon} aria-hidden>
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  {
    id: "fixtures",
    label: "Fixtures",
    icon: "M8 2v4M16 2v4M4 8h16M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  },
  {
    id: "standings",
    label: "Leaderboard",
    icon: "M4 20h16M8 20V12M12 20V4M16 20V10",
  },
  {
    id: "call",
    label: "Reply",
    icon: "M9 17L3 12l6-5M3 12h11a4 4 0 0 1 4 4v2",
  },
  {
    id: "vault",
    label: "Wallet",
    icon: "M6 8h12v11H6V8ZM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 12h12",
  },
];

export default function TabBar({ active, onChange, vaultDot }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Main">
      {TABS.map(({ id, label, icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            className={`${styles.tab}${isActive ? ` ${styles.active}` : ""}`}
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
          >
            <span className={styles.iconWrap}>
              <Icon d={icon} />
              {id === "vault" && vaultDot ? <span className={styles.dot} /> : null}
            </span>
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppHeader({ trailing }: { trailing?: ReactNode }) {
  return (
    <header className={styles.header}>
      <BrandMark />
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </header>
  );
}

export function AppShell({
  tab,
  onTabChange,
  vaultDot,
  headerTrailing,
  children,
}: {
  tab: TabId;
  onTabChange: (t: TabId) => void;
  vaultDot?: boolean;
  headerTrailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <AppHeader trailing={headerTrailing} />
      <main className={styles.main}>{children}</main>
      <TxLineCredit />
      <TabBar active={tab} onChange={onTabChange} vaultDot={vaultDot} />
    </div>
  );
}
