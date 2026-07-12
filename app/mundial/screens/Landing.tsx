"use client";

import { signInWithX } from "@/app/lib/auth-client";
import { SOCIAL_DISCORD_URL, SOCIAL_X_URL } from "@/app/lib/socialLinks";
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

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} aria-hidden>
      <path d="M20.317 4.37a19.8 19.8 0 00-4.885-1.515.07.07 0 00-.074.035c-.21.375-.444.864-.608 1.25a18.3 18.3 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.07.07 0 00-.074-.035A19.7 19.7 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 00.031.057 19.9 19.9 0 005.993 3.03.08.08 0 00.084-.027c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.07.07 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 01.078.01c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 00.084.028 19.8 19.8 0 006.002-3.03.08.08 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
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
          Reply on X before kickoff with your scoreline. The top 20 each day win
          USDC rewards across three tiers — connect a Solana wallet in Wallet to collect.
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
            href={SOCIAL_DISCORD_URL}
            className={styles.footerIcon}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Discord"
          >
            <DiscordIcon />
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
