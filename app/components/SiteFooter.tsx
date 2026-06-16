"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import SocialLinks from "./SocialLinks";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  const tDisclaimer = useTranslations("disclaimer");
  const tFaq = useTranslations("faq");
  const tDocs = useTranslations("docs");

  return (
    <footer className={styles.footer}>
      <Link href="/faq" className={styles.link}>
        {tFaq("footerLink")}
      </Link>
      <span className={styles.sep} aria-hidden>
        ·
      </span>
      <Link href="/docs" className={styles.link}>
        {tDocs("footerLink")}
      </Link>
      <span className={styles.sep} aria-hidden>
        ·
      </span>
      <Link href="/disclaimer" className={styles.link}>
        {tDisclaimer("footerLink")}
      </Link>
      <span className={styles.sep} aria-hidden>
        ·
      </span>
      <SocialLinks />
    </footer>
  );
}
