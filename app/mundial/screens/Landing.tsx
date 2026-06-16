"use client";

import { signInWithX } from "@/app/lib/auth-client";
import { isInAppBrowser } from "../lib/mobile-browser";
import { mundialDocsPath, mundialHomePath } from "../lib/mundial-path";
import Button from "../ui/Button";
import BrandMark from "../ui/BrandMark";
import styles from "./Landing.module.css";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622z" />
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
          Free to play · Wallet only needed for payouts ·{" "}
          <a href={mundialDocsPath()} className={styles.inAppLink}>
            Docs
          </a>
        </p>
      </div>
    </div>
  );
}
