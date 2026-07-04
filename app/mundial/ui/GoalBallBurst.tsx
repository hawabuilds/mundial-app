"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./GoalBallBurst.module.css";

export type GoalBurstEvent = {
  side: "home" | "away";
  player: string | null;
  ownGoal: boolean;
};

type Props = {
  event: GoalBurstEvent | null;
  onDone?: () => void;
};

function SoccerBall() {
  return (
    <svg
      className={styles.ball}
      viewBox="0 0 100 100"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="goalBallShade" cx="35%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f2f2f2" />
          <stop offset="100%" stopColor="#c8c8c8" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#goalBallShade)" stroke="#1a1a1a" strokeWidth="1.5" />
      <path
        fill="#1a1a1a"
        d="M50 14 L58 28 L74 26 L66 40 L74 54 L58 52 L50 66 L42 52 L26 54 L34 40 L26 26 L42 28 Z"
      />
      <path
        fill="#1a1a1a"
        d="M50 34 L58 42 L54 52 L46 52 L42 42 Z"
      />
      <path
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="1.2"
        d="M50 14 L50 34 M58 28 L58 42 M74 26 L54 52 M66 40 L46 52 M74 54 L42 52 M58 52 L42 42 M50 66 L46 52 M42 52 L42 42 M26 54 L54 52 M34 40 L46 52 M26 26 L42 42 M42 28 L42 42"
      />
      <ellipse cx="38" cy="36" rx="10" ry="6" fill="rgba(255,255,255,0.35)" transform="rotate(-24 38 36)" />
    </svg>
  );
}

export default function GoalBallBurst({ event, onDone }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => onDone?.(), 1250);
    return () => window.clearTimeout(timer);
  }, [event, onDone]);

  if (!mounted || !event) return null;

  const scorerLabel = event.player
    ? `${event.player}${event.ownGoal ? " (OG)" : ""}`
    : event.ownGoal
      ? "Own goal"
      : null;

  return createPortal(
    <div
      className={`${styles.overlay} ${styles[event.side]}`}
      aria-hidden
    >
      <div className={styles.flash} />
      <div className={styles.stage}>
        <p className={styles.goalWord} aria-hidden>
          GOAL
        </p>
        <SoccerBall />
      </div>
      {scorerLabel ? (
        <p className={styles.label}>
          <span className={styles.scorer}>{scorerLabel}</span>
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
