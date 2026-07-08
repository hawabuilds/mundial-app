"use client";

import FixtureCard from "../ui/FixtureCard";
import type { MundialFixture } from "../lib/fixtures";
import styles from "../goal-preview/GoalPreview.module.css";

/** Regulation FT demo — goals only in 90 minutes, matches settlement footnote. */
const DEMO_FIXTURE: MundialFixture = {
  id: 72,
  home: "France",
  away: "Morocco",
  homeCode: "FR",
  awayCode: "MA",
  date: "2026-07-05",
  time: "20:00",
  stage: "Round of 16",
  venueLine: "MetLife Stadium",
  status: "FT",
  statusLabel: "FT",
  homeScore: 2,
  awayScore: 1,
  elapsed: null,
  phase: "recent",
  goals: [
    { side: "away", player: "En-Nesyri", playerShort: "En-Nesyri", minute: 34, ownGoal: false, penalty: false },
    { side: "home", player: "Griezmann", playerShort: "Griezmann", minute: 58, ownGoal: false, penalty: false },
    { side: "home", player: "Mbappé", playerShort: "Mbappé", minute: 88, ownGoal: false, penalty: false },
  ],
  marketOdds: { homePct: 58, drawPct: 24, awayPct: 18 },
  terminalStatusId: 5,
  txlineProof: {
    fixtureId: 72,
    txFixtureId: 18198201,
    seq: 980,
    proofTs: null,
    proofReference: "0x4a1c…9f02",
    stats: [
      { key: 1001, value: 1, period: 100 },
      { key: 1002, value: 0, period: 100 },
      { key: 3001, value: 1, period: 100 },
      { key: 3002, value: 1, period: 100 },
    ],
    solanaExplorerUrl: null,
    fetchedAt: "2026-07-08T00:00:00.000Z",
    showVerifiedBadge: true,
    semanticsMismatch: false,
    proofMode: "regulation",
    verificationCopy:
      "Regulation proof matches the settled score used for prediction scoring.",
    officialStats: [
      { key: 1, value: 2, period: 100 },
      { key: 2, value: 1, period: 100 },
    ],
    regulationStats: [
      { key: 1001, value: 1, period: 100 },
      { key: 1002, value: 0, period: 100 },
      { key: 3001, value: 1, period: 100 },
      { key: 3002, value: 1, period: 100 },
    ],
    officialSeq: 980,
    regulationSeq: 980,
    seqSource: "game_finalised",
  },
};

export default function ProofPreviewPage() {
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <p className={styles.eyebrow}>UI preview</p>
        <h1 className={styles.title}>TxLINE verified badge</h1>
        <p className={styles.copy}>
          FT card after regulation settlement — proof matches{" "}
          <code>match_state</code> (France 2–1 Morocco, 90 minutes).
        </p>
        <div className={styles.demo}>
          <FixtureCard fixture={DEMO_FIXTURE} featured />
        </div>
      </div>
    </main>
  );
}
