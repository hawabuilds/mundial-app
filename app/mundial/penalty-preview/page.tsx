"use client";

import { useCallback, useMemo, useState } from "react";
import type { PenaltyKick, PenaltyShootout } from "@/lib/penaltyShootout";
import FixtureCard from "../ui/FixtureCard";
import type { MundialFixture } from "../lib/fixtures";
import styles from "../goal-preview/GoalPreview.module.css";

const MATCH_ID = 99;

function shootout(
  kicks: PenaltyKick[],
  inProgress: boolean,
): PenaltyShootout {
  let homeScore = 0;
  let awayScore = 0;
  for (const kick of kicks) {
    if (kick.outcome !== "scored") continue;
    if (kick.side === "home") homeScore += 1;
    else awayScore += 1;
  }
  return {
    homeScore,
    awayScore,
    inProgress,
    kicks,
    aetHome: 1,
    aetAway: 1,
  };
}

const REGULATION_GOALS: MundialFixture["goals"] = [
  { side: "home", player: "Bellingham", playerShort: "Bellingham", minute: 17, ownGoal: false, penalty: false },
  { side: "away", player: "Embolo", playerShort: "Embolo", minute: 74, ownGoal: false, penalty: false },
];

const KICK_SEQUENCE: PenaltyKick[] = [
  { side: "away", player: "Akanji", playerShort: "Akanji", outcome: "scored", teamKick: 1, seq: 101 },
  { side: "home", player: "Palmer", playerShort: "Palmer", outcome: "scored", teamKick: 1, seq: 102 },
  { side: "away", player: "Xhaka", playerShort: "Xhaka", outcome: "scored", teamKick: 2, seq: 103 },
  { side: "home", player: "Saka", playerShort: "Saka", outcome: "missed", teamKick: 2, seq: 104 },
  { side: "away", player: "Vargas", playerShort: "Vargas", outcome: "scored", teamKick: 3, seq: 105 },
  { side: "home", player: "Toney", playerShort: "Toney", outcome: "scored", teamKick: 3, seq: 106 },
  { side: "away", player: "Shaqiri", playerShort: "Shaqiri", outcome: "missed", teamKick: 4, seq: 107 },
  { side: "home", player: "Alexander-Arnold", playerShort: "Alexander-Arnold", outcome: "scored", teamKick: 4, seq: 108 },
  { side: "away", player: "Sommer", playerShort: "Sommer", outcome: "scored", teamKick: 5, seq: 109 },
];

function baseFixture(penaltyShootout: PenaltyShootout, status: "P" | "FT"): MundialFixture {
  return {
    id: MATCH_ID,
    home: "England",
    away: "Switzerland",
    homeCode: "GB",
    awayCode: "CH",
    date: "2026-07-06",
    time: "19:00",
    stage: "Round of 16",
    venueLine: "RheinEnergieSTADION",
    status,
    statusLabel: status === "P" ? "Penalties" : "FT",
    homeScore: 1,
    awayScore: 1,
    elapsed: null,
    phase: status === "P" ? "live" : "recent",
    goals: REGULATION_GOALS,
    marketOdds: null,
    terminalStatusId: status === "FT" ? 13 : null,
    penaltyShootout,
    txlineProof:
      status === "FT"
        ? {
            fixtureId: MATCH_ID,
            txFixtureId: 18202701,
            seq: 1000,
            proofTs: null,
            proofReference: null,
            stats: [],
            solanaExplorerUrl: null,
            fetchedAt: new Date().toISOString(),
            showVerifiedBadge: true,
            semanticsMismatch: false,
            proofMode: "regulation",
            verificationCopy: null,
            officialStats: [],
            regulationStats: [],
            officialSeq: null,
            regulationSeq: null,
            seqSource: null,
          }
        : null,
  };
}

const PRESETS = {
  live: baseFixture(shootout(KICK_SEQUENCE.slice(0, 4), true), "P"),
  finished: baseFixture(shootout(KICK_SEQUENCE, false), "FT"),
};

export default function PenaltyPreviewPage() {
  const [step, setStep] = useState(0);
  const [stepResetKey, setStepResetKey] = useState(0);

  const steppedFixture = useMemo(() => {
    const kicks = KICK_SEQUENCE.slice(0, step);
    const pens = shootout(kicks, step < KICK_SEQUENCE.length);
    return baseFixture(pens, step < KICK_SEQUENCE.length ? "P" : "FT");
  }, [step]);

  const advanceKick = useCallback(() => {
    setStep((prev) => Math.min(prev + 1, KICK_SEQUENCE.length));
  }, []);

  const resetSteps = useCallback(() => {
    setStep(0);
    setStepResetKey((key) => key + 1);
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <p className={styles.eyebrow}>UI preview</p>
        <h1 className={styles.title}>Penalty shootout</h1>
        <p className={styles.copy}>
          AET score stays 1–1. Pens 3–4 below the score. Country, scorers, then ○/×
          under each side — tap a mark for the full name.
        </p>
        <p className={styles.note}>
          <a className={styles.link} href="/goal-preview">
            Goal moment preview
          </a>
        </p>

        <div className={styles.demo}>
          <p className={styles.eyebrow}>Featured — live (Switzerland lead 2–1 pens)</p>
          <FixtureCard fixture={PRESETS.live} featured />
        </div>

        <div className={styles.demo}>
          <p className={styles.eyebrow}>Featured — finished (Switzerland win 4–3 pens)</p>
          <FixtureCard fixture={PRESETS.finished} featured />
        </div>

        <div className={styles.demo}>
          <p className={styles.eyebrow}>Compact</p>
          <FixtureCard fixture={PRESETS.finished} />
        </div>

        <div className={styles.demo}>
          <p className={styles.eyebrow}>
            Step-through ({step}/{KICK_SEQUENCE.length} kicks)
          </p>
          <FixtureCard key={stepResetKey} fixture={steppedFixture} featured />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={advanceKick}>
            Add next kick
          </button>
          <button type="button" className={styles.button} onClick={resetSteps}>
            Reset step-through
          </button>
        </div>
      </div>
    </main>
  );
}
