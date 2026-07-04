import {
  BASE_EXACT,
  BASE_OUTCOME,
  BASE_PARTICIPATION,
  MAX_UPSET_MULTIPLIER,
} from "@/lib/scoring";
import styles from "./ScoringRules.module.css";

export default function ScoringRules() {
  return (
    <section className={styles.wrap} aria-label="How points work">
      <p className={styles.title}>How points work</p>
      <div className={styles.tiers}>
        <div className={styles.tier}>
          <span className={styles.tierPts}>{BASE_EXACT}</span>
          <span className={styles.tierLbl}>Exact</span>
        </div>
        <div className={styles.tier}>
          <span className={styles.tierPts}>{BASE_OUTCOME}</span>
          <span className={styles.tierLbl}>Right result</span>
        </div>
        <div className={styles.tier}>
          <span className={styles.tierPts}>{BASE_PARTICIPATION}</span>
          <span className={styles.tierLbl}>Played</span>
        </div>
      </div>
      <p className={styles.bonus}>
        Get the result right and your base is multiplied by the{" "}
        <strong>locked TxLINE market</strong> — up to ×{MAX_UPSET_MULTIPLIER}{" "}
        when you back the underdog.
      </p>
    </section>
  );
}
