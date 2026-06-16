"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DM_Mono, Outfit } from "next/font/google";
import { hasSignedInWithXBefore, signInWithX } from "../lib/auth-client";
import { LAND_LOGO_SRC } from "./landing-assets/logo";
import SiteFooter from "./SiteFooter";
import { XIcon } from "./SocialIcons";
import SwitchXAccountModal from "./SwitchXAccountModal";
import styles from "./Landing.module.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

function XLogo() {
  return <XIcon className={styles.xIcon} />;
}

export default function Landing() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const [switchModalOpen, setSwitchModalOpen] = useState(false);

  const handleSignIn = () => {
    if (hasSignedInWithXBefore()) {
      setSwitchModalOpen(true);
      return;
    }
    void signInWithX();
  };

  return (
    <>
      <div
        id="s-landing"
        className={`${styles.root} ${outfit.variable} ${dmMono.variable}`}
      >
        <div className={styles.aurora} aria-hidden />

        <div className={styles.stage}>
          <div className={styles.center}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.logo}
              src={LAND_LOGO_SRC}
              alt={tc("scoreLogoAlt")}
            />

            <p className={styles.kicker}>{t("heroTag")}</p>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.manifesto}>{t("subtitle")}</p>

            <button
              type="button"
              className={styles.cta}
              onClick={handleSignIn}
            >
              <XLogo />
              {t("signInWithX")}
            </button>

            <p className={styles.trust}>{t("trustLine")}</p>
          </div>
        </div>

        <SiteFooter />
      </div>

      <SwitchXAccountModal
        open={switchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
      />
    </>
  );
}
