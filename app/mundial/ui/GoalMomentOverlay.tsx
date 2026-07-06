"use client";

import { useEffect, useId } from "react";
import {
  GOAL_MOMENT_MS,
  goalCelebrationTimingStyle,
  type GoalCelebration,
} from "./goalCelebration";
import { GoalCelebrationPortal } from "./goalCelebrationPortal";
import SoccerBallGraphic from "./SoccerBallGraphic";
import styles from "./GoalMomentOverlay.module.css";

type Props = {
  event: GoalCelebration;
  onDone?: () => void;
};

/**
 * Premium broadcast beat: ball through perspective → impact → GOAL → hold → fade.
 * Scorer and score update on the featured card below.
 */
export default function GoalMomentOverlay({ event, onDone }: Props) {
  const idPrefix = useId().replace(/:/g, "");

  useEffect(() => {
    const timer = window.setTimeout(() => onDone?.(), GOAL_MOMENT_MS);
    return () => window.clearTimeout(timer);
  }, [event.key, onDone]);

  return (
    <GoalCelebrationPortal>
      <div
        key={event.key}
        style={goalCelebrationTimingStyle()}
        className={`${styles.overlay} ${styles[event.side]}`}
        aria-hidden
      >
        <div className={styles.backdrop} />
        <div className={styles.backdropFloor} />

        <div className={styles.stage}>
          <div className={styles.shakeLayer}>
            <div className={styles.heroSlot}>
              <div className={styles.impactFlash} />
              <div className={styles.impactRing} />

              <div className={styles.ballTunnel}>
                <div className={styles.ballWrap}>
                  <SoccerBallGraphic
                    idPrefix={`${idPrefix}-${event.key}`}
                    className={styles.ballGraphic}
                  />
                </div>
              </div>

              <div className={styles.headline}>
                <p className={styles.goalWord}>Goal</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GoalCelebrationPortal>
  );
}
