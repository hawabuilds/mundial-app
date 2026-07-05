"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import SoccerBallGraphic from "./SoccerBallGraphic";
import styles from "./GoalBallBurst.module.css";

/** Must match --goal-duration in GoalBallBurst.module.css (+ buffer). */
export const GOAL_BURST_MS = 3200;

export type GoalBurstEvent = {
  side: "home" | "away";
  player: string | null;
  ownGoal: boolean;
};

type Props = {
  event: GoalBurstEvent | null;
  onDone?: () => void;
};

export default function GoalBallBurst({ event, onDone }: Props) {
  const idPrefix = useId().replace(/:/g, "");

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => onDone?.(), GOAL_BURST_MS);
    return () => window.clearTimeout(timer);
  }, [event, onDone]);

  if (!event) return null;

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
      <div className={styles.vignette} />
      <div className={styles.flash} />
      <div className={styles.stageShake}>
        <div className={styles.stage}>
          <p className={styles.goalWord}>GOAL</p>

          <div className={styles.ballScene}>
            <div className={styles.groundShadow} />
            <div className={styles.impactRing} />
            <div className={styles.ballFlight}>
              <div className={styles.ballSpin}>
                <SoccerBallGraphic
                  idPrefix={idPrefix}
                  className={styles.ballGraphic}
                />
              </div>
            </div>
            <div className={styles.lensFlare} />
          </div>
        </div>
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
