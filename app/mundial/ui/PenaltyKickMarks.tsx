"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PenaltyKick } from "@/lib/penaltyShootout";
import { isPenaltyKickMissed } from "@/lib/penaltyShootout";
import { goalScorerDisplayName } from "@/lib/playerDisplayName";
import styles from "./PenaltyKickMarks.module.css";

type PenaltyKickMarksProps = {
  kicks: PenaltyKick[];
  side: "home" | "away";
  revealedKeys: ReadonlySet<string>;
  nameFlashKeys: ReadonlySet<string>;
};

export function penaltyKickKey(kick: Pick<PenaltyKick, "side" | "seq">): string {
  return `${kick.side}|${kick.seq}`;
}

const EXPANDED_NAME_MS = 2000;

/** Shared geometry so ○ and × occupy the same visual box. */
const MARK_VIEW = 16;
const MARK_CENTER = 8;
const MARK_RADIUS = 5;
const MARK_STROKE = 1.75;
/** × arms extend ~10% past the circle path so visual weight matches the ring. */
const MARK_MISS_RADIUS = MARK_RADIUS * 1.1;
const MARK_MISS_DIAG = MARK_MISS_RADIUS / Math.SQRT2;

function PenaltyMarkIcon({ missed }: { missed: boolean }) {
  const strokeProps = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: missed ? MARK_STROKE + 0.15 : MARK_STROKE,
  };

  return (
    <svg className={styles.markSvg} viewBox={`0 0 ${MARK_VIEW} ${MARK_VIEW}`} aria-hidden>
      {missed ? (
        <path
          d={`M${MARK_CENTER - MARK_MISS_DIAG} ${MARK_CENTER - MARK_MISS_DIAG} L${MARK_CENTER + MARK_MISS_DIAG} ${MARK_CENTER + MARK_MISS_DIAG} M${MARK_CENTER + MARK_MISS_DIAG} ${MARK_CENTER - MARK_MISS_DIAG} L${MARK_CENTER - MARK_MISS_DIAG} ${MARK_CENTER + MARK_MISS_DIAG}`}
          strokeLinecap="round"
          {...strokeProps}
        />
      ) : (
        <circle
          cx={MARK_CENTER}
          cy={MARK_CENTER}
          r={MARK_RADIUS}
          {...strokeProps}
        />
      )}
    </svg>
  );
}

export default function PenaltyKickMarks({
  kicks,
  side,
  revealedKeys,
  nameFlashKeys,
}: PenaltyKickMarksProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expandTimerRef = useRef<number | null>(null);

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current != null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearExpandTimer(), [clearExpandTimer]);

  const toggleExpand = useCallback(
    (key: string) => {
      clearExpandTimer();
      setExpandedKey((prev) => {
        if (prev === key) return null;
        expandTimerRef.current = window.setTimeout(() => {
          setExpandedKey((current) => (current === key ? null : current));
          expandTimerRef.current = null;
        }, EXPANDED_NAME_MS);
        return key;
      });
    },
    [clearExpandTimer],
  );

  const sideKicks = kicks
    .filter((kick) => kick.side === side && revealedKeys.has(penaltyKickKey(kick)))
    .sort((a, b) => a.seq - b.seq);

  if (sideKicks.length === 0) return null;

  return (
    <div className={styles.row} aria-label={`${side} penalty kicks`}>
      {sideKicks.map((kick) => {
        const key = penaltyKickKey(kick);
        const missed = isPenaltyKickMissed(kick.outcome);
        const name = goalScorerDisplayName(kick);
        const flashing = nameFlashKeys.has(key);
        const expanded = expandedKey === key;
        const showName = name != null && (flashing || expanded);

        return (
          <span key={key} className={styles.cell}>
            <button
              type="button"
              className={`${styles.markBtn}${missed ? ` ${styles.markBtnMissed}` : ` ${styles.markBtnScored}`} ${styles.markEnter}`}
              aria-label={
                name
                  ? `${name}, penalty ${missed ? "missed" : "scored"}`
                  : missed
                    ? "Penalty missed"
                    : "Penalty scored"
              }
              onClick={() => toggleExpand(key)}
            >
              <PenaltyMarkIcon missed={missed} />
            </button>
            {showName ? (
              <span
                className={`${styles.name}${flashing ? ` ${styles.nameFlash}` : ` ${styles.nameExpanded}`}`}
              >
                {name}
              </span>
            ) : (
              <span className={styles.nameSlot} aria-hidden />
            )}
          </span>
        );
      })}
    </div>
  );
}
