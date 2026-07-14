"use client";

import { useCallback, useEffect, useState } from "react";
import type { GoalCelebration } from "../ui/goalCelebration";
import FixtureCard from "../ui/FixtureCard";
import GoalMomentOverlay from "../ui/GoalMomentOverlay";
import type { MundialFixture } from "../lib/fixtures";
import styles from "./GoalPreview.module.css";

const DEMO_FIXTURE: MundialFixture = {
  id: 76,
  home: "Brazil",
  away: "Norway",
  homeCode: "BR",
  awayCode: "NO",
  date: "2026-07-05",
  time: "20:00",
  stage: "Round of 16",
  venueLine: "MetLife Stadium",
  status: "LIVE",
  statusLabel: "Live",
  homeScore: 2,
  awayScore: 1,
  elapsed: 67,
  phase: "live",
  goals: [
    { side: "home", player: "Neymar", playerShort: "Neymar", minute: 23, ownGoal: false, penalty: false },
    { side: "away", player: "Haaland", playerShort: "Haaland", minute: 51, ownGoal: false, penalty: false },
    { side: "home", player: "Neymar", playerShort: "Neymar", minute: 67, ownGoal: false, penalty: false },
  ],
  marketOdds: null,
};

const PRESETS: Array<{
  label: string;
  build: (key: number) => GoalCelebration;
  fixture: MundialFixture;
}> = [
  {
    label: "Replay — Home goal (Neymar 67')",
    build: (key) => ({
      key,
      matchId: 76,
      side: "home",
      player: "Neymar",
      ownGoal: false,
      minute: 67,
      penalty: false,
      home: "Brazil",
      away: "Norway",
      homeCode: "BR",
      awayCode: "NO",
      homeScore: 2,
      awayScore: 1,
      prevHomeScore: 1,
      prevAwayScore: 1,
    }),
    fixture: DEMO_FIXTURE,
  },
  {
    label: "Replay — Away goal (Haaland 51')",
    build: (key) => ({
      key,
      matchId: 76,
      side: "away",
      player: "Haaland",
      ownGoal: false,
      minute: 51,
      penalty: false,
      home: "Brazil",
      away: "Norway",
      homeCode: "BR",
      awayCode: "NO",
      homeScore: 1,
      awayScore: 1,
      prevHomeScore: 1,
      prevAwayScore: 0,
    }),
    fixture: {
      ...DEMO_FIXTURE,
      homeScore: 1,
      awayScore: 1,
      elapsed: 51,
      goals: [
        { side: "home", player: "Neymar", playerShort: "Neymar", minute: 23, ownGoal: false, penalty: false },
        { side: "away", player: "Haaland", playerShort: "Haaland", minute: 51, ownGoal: false, penalty: false },
      ],
    },
  },
];

export default function GoalPreviewPage() {
  const [celebration, setCelebration] = useState<GoalCelebration | null>(null);
  const [fixture, setFixture] = useState(DEMO_FIXTURE);

  const play = useCallback((preset: (typeof PRESETS)[number]) => {
    setFixture(preset.fixture);
    setCelebration(preset.build(Date.now()));
  }, []);

  const clearCelebration = useCallback(() => setCelebration(null), []);

  useEffect(() => {
    const timer = window.setTimeout(() => play(PRESETS[0]!), 500);
    return () => window.clearTimeout(timer);
  }, [play]);

  return (
    <main className={styles.page}>
      {celebration ? (
        <GoalMomentOverlay event={celebration} onDone={clearCelebration} />
      ) : null}

      <div className={styles.panel}>
        <p className={styles.eyebrow}>Animation preview</p>
        <h1 className={styles.title}>Goal moment</h1>
        <p className={styles.copy}>
          Score and scorer flip when GOAL holds (~2.7s), then the overlay fades.
        </p>
        <p className={styles.note}>
          <a className={styles.link} href="/penalty-preview">
            Penalty shootout preview
          </a>
        </p>

        <div className={styles.demo}>
          <FixtureCard
            key={`${fixture.homeScore}-${fixture.awayScore}-${celebration?.key ?? 0}`}
            fixture={fixture}
            featured
            celebration={celebration}
          />
        </div>

        <div className={styles.actions}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={styles.button}
              onClick={() => play(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

