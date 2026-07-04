import {
  BASE_EXACT,
  BASE_OUTCOME,
  BASE_PARTICIPATION,
  MAX_UPSET_MULTIPLIER,
} from "@/lib/scoring";
import styles from "./ScoringRules.module.css";

export default function ScoringRules() {
  return (
    <section className={styles.wrap} aria-label="Points">
      <p className={styles.title}>Points</p>
      <div className={styles.tiers}>
        <div className={styles.tier}>
          <span className={styles.tierPts}>{BASE_EXACT}</span>
          <span className={styles.tierLbl}>Exact score</span>
        </div>
        <div className={styles.tier}>
          <span className={styles.tierPts}>{BASE_OUTCOME}</span>
          <span className={styles.tierLbl}>Right winner</span>
        </div>
        <div className={styles.tier}>
          <span className={styles.tierPts}>{BASE_PARTICIPATION}</span>
          <span className={styles.tierLbl}>You played</span>
        </div>
      </div>
      <p className={styles.bonus}>
        Get the winner right and you can earn up to {MAX_UPSET_MULTIPLIER} times
        more when you pick what the market did not expect.
      </p>
    </section>
  );
}
