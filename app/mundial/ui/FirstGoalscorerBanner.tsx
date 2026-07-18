"use client";

import styles from "./FirstGoalscorerBanner.module.css";

type Props = {
  extraCount?: number;
  sticky?: boolean;
  onOpen: () => void;
};

export default function FirstGoalscorerBanner({
  extraCount = 0,
  sticky = false,
  onOpen,
}: Props) {
  return (
    <div className={sticky ? `${styles.wrap} ${styles.wrapSticky}` : styles.wrap}>
      <button type="button" className={styles.banner} onClick={onOpen}>
        <span className={styles.inner}>
          <span className={styles.copy}>
            <span className={styles.kicker}>Double your points</span>
            <span className={styles.hint}>
              Choose the first goalscorer before kickoff
              {extraCount > 0 ? ` · +${extraCount} more match${extraCount > 1 ? "es" : ""}` : ""}
            </span>
          </span>
          <span className={styles.cta}>Pick now</span>
        </span>
      </button>
    </div>
  );
}
