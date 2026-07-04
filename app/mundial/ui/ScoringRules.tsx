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
        Get the result right and your points multiply by the market.
      </p>
      <p className={styles.bonus}>
        Underdog calls earn up to {MAX_UPSET_MULTIPLIER}x.
      </p>
    </section>
  );
}
