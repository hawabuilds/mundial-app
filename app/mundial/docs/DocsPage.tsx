"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mundialDocsPath, mundialHomePath } from "../lib/mundial-path";
import BrandMark from "../ui/BrandMark";
import styles from "./DocsPage.module.css";

const SECTIONS = [
  { id: "play", label: "Play" },
  { id: "pool", label: "Prize pool" },
  { id: "tiers", label: "Tiers" },
  { id: "wallet", label: "Wallet" },
  { id: "token", label: "Token" },
  { id: "faq", label: "FAQ" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"] | "top";

const POOL_MIN = 1000;
const POOL_MAX = 2000;

function poolAmounts(pool: number) {
  const tier1 = Math.round((pool * 100) / 1070);
  const tier2 = Math.round((pool * 60) / 1070);
  const tier3 = Math.round((pool * 35) / 1070);
  return { tier1, tier2, tier3 };
}

export default function DocsPage() {
  const [active, setActive] = useState<SectionId>("top");
  const [poolPreview, setPoolPreview] = useState(1500);
  const observer = useRef<IntersectionObserver | null>(null);
  const home = mundialHomePath();

  const amounts = poolAmounts(poolPreview);

  useEffect(() => {
    const ids = ["top", ...SECTIONS.map((s) => s.id)];
    observer.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id as SectionId);
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: 0 },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.current?.observe(el);
    });

    return () => observer.current?.disconnect();
  }, []);

  const jump = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.page}>
      <div className={styles.mesh} aria-hidden />
      <div className={styles.grid} aria-hidden />

      <header className={styles.topbar}>
        <Link href={home} className={styles.brandLink}>
          <BrandMark />
        </Link>
        <nav className={styles.topNav} aria-label="Documentation sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.navPill} ${active === s.id ? styles.navPillActive : ""}`}
              onClick={() => jump(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <Link href={home} className={styles.playCta}>
          Open app
        </Link>
      </header>

      <main className={styles.main}>
        <section id="top" className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>World Cup 2026 on Solana via pump.fun</p>
            <h1 className={styles.heroTitle}>
              Predict.
              <br />
              <span className={styles.heroAccent}>Rank.</span>
              <br />
              Get paid in USDC.
            </h1>
            <p className={styles.heroLede}>
              Copa Mundial is a score prediction game on X. Reply before kickoff,
              climb the board, and share a USDC pool funded by pump.fun
              creator fees.
            </p>
            <div className={styles.heroBadges}>
              <span className={styles.badge}>Daily USDC</span>
              <span className={styles.badge}>Top 20 paid</span>
              <span className={styles.badgeSol}>Solana</span>
            </div>
          </div>

          <div className={styles.heroPanel}>
            <p className={styles.panelLabel}>Today&apos;s prize pool</p>
            <p className={styles.panelValue}>
              <span className={styles.panelCurrency}>$</span>
              {poolPreview.toLocaleString()}
              <span className={styles.panelSuffix}> USDC</span>
            </p>
            <div className={styles.poolTrack}>
              <div
                className={styles.poolFill}
                style={{
                  width: `${((poolPreview - POOL_MIN) / (POOL_MAX - POOL_MIN)) * 100}%`,
                }}
              />
            </div>
            <div className={styles.poolBounds}>
              <span>${POOL_MIN.toLocaleString()} start</span>
              <span>${POOL_MAX.toLocaleString()} cap</span>
            </div>
            <p className={styles.panelNote}>
              The pool grows as trading volume goes up.
            </p>
          </div>
        </section>

        <section id="play" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>01</span>
            <h2 className={styles.sectionTitle}>How to play</h2>
            <p className={styles.sectionSub}>
              No app download. No wallet to start. Just X.
            </p>
          </div>

          <div className={styles.bento}>
            <article className={`${styles.bentoCard} ${styles.bentoWide}`}>
              <span className={styles.step}>Step 1</span>
              <h3>Find the match thread</h3>
              <p>
                We post each match on X with the teams, kickoff time, and a thread
                for your prediction. Follow{" "}
                <a href="https://x.com/copamundialapp" className={styles.inlineLink}>
                  @copamundialapp
                </a>{" "}
                so you do not miss one.
              </p>
            </article>
            <article className={styles.bentoCard}>
              <span className={styles.step}>Step 2</span>
              <h3>Reply your score</h3>
              <p>
                Reply before kickoff with both teams and a score, for example{" "}
                <code className={styles.code}>Brazil 2-1 Morocco</code>. Your first
                valid reply counts.
              </p>
            </article>
            <article className={styles.bentoCard}>
              <span className={styles.step}>Step 3</span>
              <h3>Earn points</h3>
              <p>
                Exact scorelines score the most. Correct winner or draw still
                earns points. Every match adds to your total for the current
                leaderboard period.
              </p>
            </article>
            <article className={`${styles.bentoCard} ${styles.bentoAccent}`}>
              <span className={styles.step}>Step 4</span>
              <h3>Make top 20</h3>
              <p>
                Each day at 10:00 UTC we snapshot the top 20 and open USDC claims
                for winners. The leaderboard resets every 3 days so everyone gets
                a fair chance to climb — you are not chasing points from weeks ago.
              </p>
            </article>
          </div>

          <div className={styles.scoreRow}>
            <div className={styles.scoreCard}>
              <span className={styles.scorePts}>5</span>
              <span className={styles.scoreLbl}>Exact score</span>
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.scorePts}>3</span>
              <span className={styles.scoreLbl}>Right outcome</span>
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.scorePts}>1</span>
              <span className={styles.scoreLbl}>Played</span>
            </div>
          </div>
        </section>

        <section id="pool" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>02</span>
            <h2 className={styles.sectionTitle}>Prize pool</h2>
            <p className={styles.sectionSub}>
              Funded by creator fees from pump.fun trading.
            </p>
          </div>

          <div className={styles.split}>
            <div className={styles.splitMain}>
              <p className={styles.prose}>
                When Copa Mundial launches on{" "}
                <strong className={styles.strong}>pump.fun</strong>, creator fees
                from trading go into the daily USDC prize pool. We start at{" "}
                <strong className={styles.strong}>$1,000</strong> per day and can
                scale up to <strong className={styles.strong}>$2,000</strong> as
                volume grows.
              </p>
              <p className={styles.prose}>
                Prizes are paid in{" "}
                <strong className={styles.strong}>USDC on Solana</strong>. A bigger
                pool means bigger payouts for the same top 20 finish.
              </p>
              <ul className={styles.bulletList}>
                <li>Minimum daily pool: $1,000 USDC</li>
                <li>Target at full volume: $2,000 USDC</li>
                <li>Snapshot &amp; claims: 10:00 UTC daily</li>
                <li>Leaderboard resets every 3 days for a fair shot at the top</li>
                <li>20 winners per day</li>
              </ul>
            </div>

            <div className={styles.poolSimulator}>
              <label className={styles.simLabel} htmlFor="pool-slider">
                Preview pool size
              </label>
              <input
                id="pool-slider"
                type="range"
                min={POOL_MIN}
                max={POOL_MAX}
                step={50}
                value={poolPreview}
                onChange={(e) => setPoolPreview(Number(e.target.value))}
                className={styles.slider}
              />
              <p className={styles.simValue}>${poolPreview.toLocaleString()} USDC</p>
              <div className={styles.simBreakdown}>
                <div>
                  <span>Tier 1 ×3</span>
                  <strong>${amounts.tier1}</strong>
                </div>
                <div>
                  <span>Tier 2 ×7</span>
                  <strong>${amounts.tier2}</strong>
                </div>
                <div>
                  <span>Tier 3 ×10</span>
                  <strong>${amounts.tier3}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tiers" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>03</span>
            <h2 className={styles.sectionTitle}>Payout tiers</h2>
            <p className={styles.sectionSub}>
              Top 20. Split 10 : 6 : 3.5 per person. Full pool paid out.
            </p>
          </div>

          <div className={styles.tierGrid}>
            <article className={`${styles.tierCard} ${styles.tier1}`}>
              <header>
                <span className={styles.tierRank}>Tier 1</span>
                <span className={styles.tierRange}>Ranks 1–3</span>
              </header>
              <p className={styles.tierShare}>~28% of pool</p>
              <p className={styles.tierEach}>~9.3% each</p>
              <div className={styles.tierBar}>
                <div className={styles.tierBarFill} style={{ width: "28%" }} />
              </div>
              <p className={styles.tierExample}>
                ${POOL_MIN.toLocaleString()} pool → ~$
                {poolAmounts(POOL_MIN).tier1} each
              </p>
            </article>

            <article className={`${styles.tierCard} ${styles.tier2}`}>
              <header>
                <span className={styles.tierRank}>Tier 2</span>
                <span className={styles.tierRange}>Ranks 4–10</span>
              </header>
              <p className={styles.tierShare}>~39% of pool</p>
              <p className={styles.tierEach}>~5.6% each</p>
              <div className={styles.tierBar}>
                <div className={styles.tierBarFill} style={{ width: "39%" }} />
              </div>
              <p className={styles.tierExample}>
                ${POOL_MAX.toLocaleString()} pool → ~$
                {poolAmounts(POOL_MAX).tier2} each
              </p>
            </article>

            <article className={`${styles.tierCard} ${styles.tier3}`}>
              <header>
                <span className={styles.tierRank}>Tier 3</span>
                <span className={styles.tierRange}>Ranks 11–20</span>
              </header>
              <p className={styles.tierShare}>~33% of pool</p>
              <p className={styles.tierEach}>~3.3% each</p>
              <div className={styles.tierBar}>
                <div className={styles.tierBarFill} style={{ width: "33%" }} />
              </div>
              <p className={styles.tierExample}>
                ${POOL_MAX.toLocaleString()} pool → ~$
                {poolAmounts(POOL_MAX).tier3} each
              </p>
            </article>
          </div>
        </section>

        <section id="wallet" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>04</span>
            <h2 className={styles.sectionTitle}>Wallet &amp; payouts</h2>
            <p className={styles.sectionSub}>
              Play on X. Claim on Solana.
            </p>
          </div>

          <div className={styles.walletFlow}>
            <div className={styles.flowStep}>
              <span className={styles.flowIcon}>𝕏</span>
              <h3>Sign in with X</h3>
              <p>Sign in at copamundial.app with X to see your rank and claim prizes.</p>
            </div>
            <div className={styles.flowArrow} aria-hidden />
            <div className={styles.flowStep}>
              <span className={styles.flowIcon}>◎</span>
              <h3>Connect Solana wallet</h3>
              <p>Connect Phantom, Solflare, or Backpack in the Wallet tab. We save that address for payouts.</p>
            </div>
            <div className={styles.flowArrow} aria-hidden />
            <div className={styles.flowStep}>
              <span className={styles.flowIcon}>$</span>
              <h3>Receive USDC</h3>
              <p>Top 20 winners claim USDC at 10:00 UTC each day. You can switch wallets before you claim.</p>
            </div>
          </div>
        </section>

        <section id="token" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>05</span>
            <h2 className={styles.sectionTitle}>Token &amp; creator fees</h2>
            <p className={styles.sectionSub}>Launched on pump.fun on Solana</p>
          </div>

          <div className={styles.tokenCard}>
            <div className={styles.tokenVisual}>
              <div className={styles.tokenRing} />
              <span className={styles.tokenGlyph}>◆</span>
            </div>
            <div className={styles.tokenCopy}>
              <p className={styles.prose}>
                Copa Mundial launches on{" "}
                <strong className={styles.strong}>pump.fun</strong> on Solana.
                Creator fees from token trading fund the daily USDC prize pool.
              </p>
              <p className={styles.prose}>
                We will post the contract address on{" "}
                <a href="https://x.com/copamundialapp" className={styles.inlineLink}>
                  @copamundialapp
                </a>{" "}
                at launch. Only use links from our official channels or this site.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>06</span>
            <h2 className={styles.sectionTitle}>FAQ</h2>
          </div>

          <dl className={styles.faq}>
            <div className={styles.faqItem}>
              <dt>Do I need a wallet to play?</dt>
              <dd>No. Reply on X before kickoff. You only need a wallet if you finish in the top 20.</dd>
            </div>
            <div className={styles.faqItem}>
              <dt>When is the daily snapshot?</dt>
              <dd>
                10:00 UTC. That locks the top 20 and opens claims for that
                day&apos;s USDC payout.
              </dd>
            </div>
            <div className={styles.faqItem}>
              <dt>When can I claim my reward?</dt>
              <dd>
                At 10:00 UTC — the same time as the snapshot. Winners can collect
                USDC in the Wallet tab once the daily run completes.
              </dd>
            </div>
            <div className={styles.faqItem}>
              <dt>Does the leaderboard reset?</dt>
              <dd>
                Yes — every 3 days. Points and ranks clear so new players are not
                stuck behind an early lead. Snapshots and claims still run at
                10:00 UTC during each period.
              </dd>
            </div>
            <div className={styles.faqItem}>
              <dt>Can I change my payout wallet?</dt>
              <dd>Yes. Disconnect and connect a new wallet before you claim. Prizes already paid stay on the old address.</dd>
            </div>
            <div className={styles.faqItem}>
              <dt>What if fewer than 20 people score?</dt>
              <dd>What is left stays in the rewards system for future days.</dd>
            </div>
            <div className={styles.faqItem}>
              <dt>Is this gambling?</dt>
              <dd>Skill-based score predictions on public match results. Check your local laws. Not affiliated with FIFA or any federation.</dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href={home} className={styles.footerBrand}>
          <BrandMark />
        </Link>
        <p className={styles.footerCopy}>
          Skill-based prediction game. Not financial advice. copamundial.app
        </p>
        <a href={mundialDocsPath()} className={styles.footerDocs}>
          {mundialDocsPath()}
        </a>
      </footer>
    </div>
  );
}
