"use client";

import FixtureCard from "../ui/FixtureCard";
import type { MundialFixture } from "../lib/fixtures";
import styles from "../goal-preview/GoalPreview.module.css";

/** Argentina 3–2 Egypt (AET) — production proof for TxFixtureId 18202701. */
const DEMO_FIXTURE: MundialFixture = {
  id: 80,
  home: "Argentina",
  away: "Egypt",
  homeCode: "AR",
  awayCode: "EG",
  date: "2026-07-07",
  time: "16:00",
  stage: "Round of 16",
  venueLine: "AT&T Stadium",
  status: "FT",
  statusLabel: "FT",
  homeScore: 3,
  awayScore: 2,
  elapsed: null,
  phase: "recent",
  goals: [
    { side: "away", player: "Salah", playerShort: "Salah", minute: 23, ownGoal: false, penalty: false },
    { side: "home", player: "Messi", playerShort: "Messi", minute: 45, ownGoal: false, penalty: true },
    { side: "home", player: "Álvarez", playerShort: "Álvarez", minute: 78, ownGoal: false, penalty: false },
    { side: "home", player: "Lautaro", playerShort: "Lautaro", minute: 112, ownGoal: false, penalty: false },
    { side: "away", player: "Trezeguet", playerShort: "Trezeguet", minute: 115, ownGoal: false, penalty: false },
  ],
  marketOdds: { homePct: 72, drawPct: 18, awayPct: 10 },
  terminalStatusId: 10,
  txlineProof: {
    fixtureId: 80,
    txFixtureId: 18202701,
    seq: 1045,
    proofTs: null,
    proofReference: "0x8f3a…c21d",
    stats: [
      { key: 1001, value: 0, period: 100 },
      { key: 1002, value: 1, period: 100 },
      { key: 3001, value: 3, period: 100 },
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
      { key: 1, value: 3, period: 100 },
      { key: 2, value: 2, period: 100 },
    ],
    regulationStats: [
      { key: 1001, value: 0, period: 100 },
      { key: 1002, value: 1, period: 100 },
      { key: 3001, value: 3, period: 100 },
      { key: 3002, value: 1, period: 100 },
    ],
    officialSeq: 1045,
    regulationSeq: 1045,
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
          FT card after settlement — regulation proof matches{" "}
          <code>match_state</code> (Argentina 3–2 Egypt AET, TxFixtureId{" "}
          <code>18202701</code>).
        </p>
        <div className={styles.demo}>
          <FixtureCard fixture={DEMO_FIXTURE} featured />
        </div>
      </div>
    </main>
  );
}
