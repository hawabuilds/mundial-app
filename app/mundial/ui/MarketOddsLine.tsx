"use client";

import type { MatchMarketOdds } from "@/app/lib/leaderboard-client";
import {
  formatUpsetMultiplier,
  upsetMultiplier,
  type Match1x2Odds,
} from "@/lib/scoring";
import styles from "./MarketOddsLine.module.css";

type Props = {
  home: string;
  away: string;
  odds: MatchMarketOdds;
  /** Pre-kickoff line on live/FT cards. */
  locked?: boolean;
  compact?: boolean;
};

function multForOutcome(
  outcome: "home" | "draw" | "away",
  odds: Match1x2Odds,
): string {
  return formatUpsetMultiplier(upsetMultiplier(outcome, odds));
}

export default function MarketOddsLine({
  home,
  away,
  odds,
  locked = false,
  compact = false,
}: Props) {
  const homePct = Math.round(odds.homePct);
  const drawPct = Math.round(odds.drawPct);
  const awayPct = Math.round(odds.awayPct);
  const homeMult = multForOutcome("home", odds);
  const drawMult = multForOutcome("draw", odds);
  const awayMult = multForOutcome("away", odds);

  return (
    <div
      className={`${styles.wrap}${compact ? ` ${styles.compact}` : ""}${
        locked ? ` ${styles.locked}` : ""
      }`}
    >
      <p className={styles.label}>
        {locked ? "Locked pre-kickoff · TxLINE 1X2" : "TxLINE market · 1X2"}
      </p>
      <div className={styles.bar} aria-hidden>
        <span className={styles.segHome} style={{ flex: homePct || 1 }} />
        <span className={styles.segDraw} style={{ flex: drawPct || 1 }} />
        <span className={styles.segAway} style={{ flex: awayPct || 1 }} />
      </div>
      <div className={styles.pcts}>
        <span className={styles.pctHome}>
          <span className={styles.team}>{home}</span>
          <strong>{homePct}%</strong>
          <span className={styles.mult}>{homeMult}</span>
        </span>
        <span className={styles.pctDraw}>
          <span className={styles.team}>Draw</span>
          <strong>{drawPct}%</strong>
          <span className={styles.mult}>{drawMult}</span>
        </span>
        <span className={styles.pctAway}>
          <span className={styles.team}>{away}</span>
          <strong>{awayPct}%</strong>
          <span className={styles.mult}>{awayMult}</span>
        </span>
      </div>
      <p className={styles.hint}>
        If your result is right, base points are multiplied by the number shown
        — up to ×3 when you beat the locked TxLINE market.
      </p>
    </div>
  );
}
