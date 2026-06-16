"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DM_Mono, Figtree } from "next/font/google";
import { LAND_LOGO_SRC } from "../components/landing-assets/logo";
import SiteFooter from "../components/SiteFooter";
import styles from "./Disclaimer.module.css";

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

export default function DisclaimerPage() {
  const t = useTranslations("disclaimer");
  const tc = useTranslations("common");

  return (
    <div
      className={`${styles.root} ${figtree.variable} ${dmMono.variable}`}
    >
      <div className={styles.app}>
        <header className={styles.nav}>
          <Link href="/" className={styles.back}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t("backHome")}
          </Link>
        </header>

        <main className={styles.body}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.logo}
            src={LAND_LOGO_SRC}
            alt={tc("scoreLogoAlt")}
          />
          <h1 className={styles.title}>{t("pageTitle")}</h1>
          <p className={styles.text}>{t("fullText")}</p>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
