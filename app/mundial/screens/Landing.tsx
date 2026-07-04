"use client";

import { signInWithX } from "@/app/lib/auth-client";
import { SOCIAL_TELEGRAM_URL, SOCIAL_X_URL } from "@/app/lib/socialLinks";
import { isInAppBrowser } from "../lib/mobile-browser";
import { mundialDocsPath, mundialHomePath } from "../lib/mundial-path";
import Button from "../ui/Button";
import BrandMark from "../ui/BrandMark";
import TxLineCredit from "../ui/TxLineCredit";
import styles from "./Landing.module.css";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} aria-hidden>
      <path d="M21.94 4.3 18.9 19.05c-.23 1.02-.84 1.27-1.7.79l-4.7-3.46-2.27 2.18c-.25.25-.46.46-.94.46l.34-4.78 8.7-7.86c.38-.34-.08-.53-.59-.19L6.7 13.1l-4.64-1.45c-1.01-.32-1.03-1.01.21-1.5L20.63 2.9c.84-.31 1.57.2 1.31 1.4z" />
    </svg>
  );
}

export default function Landing() {
  const inAppBrowser =
    typeof window !== "undefined" && isInAppBrowser();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <BrandMark size="lg" />
      </header>

      <div className={styles.hero}>
        <p className={styles.eyebrow}>World Cup 2026</p>
        <h1 className="m-display">
          Predict the score.
          <br />
          <span className={styles.accent}>Win your tier.</span>
        </h1>
        <p className={styles.lede}>
          Reply on X before kickoff with your scoreline. Points add up across every
          match. The top 20 at the daily 10:00 UTC snapshot win USDC on Solana —
          connect a wallet in the Wallet tab to collect.
        </p>
        <p className={styles.hackathon}>
          Built for the TxOdds World Cup hackathon — live fixtures, scores, and
          market odds via{" "}
          <a
            href="https://txline.txodds.com/documentation/worldcup"
            target="_blank"
            rel="noopener noreferrer"
          >
            TxLINE
          </a>
          .
        </p>
        <Button
          fullWidth
          className={styles.cta}
          onClick={() => void signInWithX(mundialHomePath())}
        >
          <XIcon />
          Sign in with X
        </Button>
        {inAppBrowser ? (
          <p className={styles.inAppHint}>
            X sign-in may not work inside this browser. Open{" "}
            <a href="https://copamundial.app" className={styles.inAppLink}>
              copamundial.app
            </a>{" "}
            in Safari or Chrome first.
          </p>
        ) : null}
        <p className={styles.note}>
          Free to play · Wallet only needed for payouts
        </p>
      </div>

      <footer className={styles.footer}>
        <TxLineCredit />
        <nav className={styles.footerDock} aria-label="Community links">
          <a
            href={SOCIAL_X_URL}
            className={styles.footerIcon}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow on X"
          >
            <XIcon />
          </a>
          <a
            href={SOCIAL_TELEGRAM_URL}
            className={styles.footerIcon}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Telegram"
          >
            <TelegramIcon />
          </a>
          <span className={styles.footerDot} aria-hidden />
          <a href={mundialDocsPath()} className={styles.footerDocs}>
            Docs
          </a>
        </nav>
      </footer>
    </div>
  );
}
