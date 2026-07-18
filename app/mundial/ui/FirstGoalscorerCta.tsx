"use client";

import styles from "./FirstGoalscorerCta.module.css";

type Props = {
  home: string;
  away: string;
  hasPick: boolean;
  locked: boolean;
  onOpen: () => void;
};

export default function FirstGoalscorerCta({
  home,
  away,
  hasPick,
  locked,
  onOpen,
}: Props) {
  if (locked && !hasPick) return null;

  const label = hasPick
    ? locked
      ? "First goalscorer locked in"
      : "Change first goalscorer pick"
    : "Pick first goalscorer · 2× points";

  return (
    <button type="button" className={styles.cta} onClick={onOpen}>
      <span className={styles.badge}>2×</span>
      <span className={styles.copy}>
        <span className={styles.label}>{label}</span>
        <span className={styles.match}>
          {home} vs {away}
        </span>
      </span>
      {!locked ? <span className={styles.chevron} aria-hidden>›</span> : null}
    </button>
  );
}
