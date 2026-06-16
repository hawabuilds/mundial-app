"use client";

import { useTranslations } from "next-intl";
import { SOCIAL_TELEGRAM_URL, SOCIAL_X_URL } from "../lib/socialLinks";
import { TelegramIcon, XIcon } from "./SocialIcons";
import styles from "./SocialLinks.module.css";

type SocialLinksProps = {
  className?: string;
};

export default function SocialLinks({ className }: SocialLinksProps) {
  const tSocial = useTranslations("social");

  return (
    <div className={`${styles.social} ${className ?? ""}`.trim()}>
      <a
        href={SOCIAL_X_URL}
        className={styles.socialLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tSocial("followXAria")}
      >
        <XIcon className={styles.socialIcon} />
      </a>
      <a
        href={SOCIAL_TELEGRAM_URL}
        className={styles.socialLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tSocial("joinTelegramAria")}
      >
        <TelegramIcon className={styles.socialIcon} />
      </a>
    </div>
  );
}
