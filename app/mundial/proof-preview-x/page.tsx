"use client";

import FixtureCard from "../ui/FixtureCard";
import { ARG_EGYPT_PROOF_FIXTURE } from "../lib/argEgyptProofFixture";
import panelStyles from "../goal-preview/GoalPreview.module.css";
import styles from "./ProofPreviewX.module.css";

/** 16:9 export — same panel scale as docs/screenshots/verified-badge.png. */
export default function ProofPreviewXPage() {
  return (
    <main id="proof-x-export" className={styles.frame}>
      <div className={panelStyles.panel}>
        <p className={panelStyles.eyebrow}>UI preview</p>
        <h1 className={panelStyles.title}>TxLINE verified badge</h1>
        <p className={panelStyles.copy}>
          FT card after settlement — proof matches{" "}
          <code>match_state</code> (Argentina 3–2 Egypt).
        </p>
        <div className={panelStyles.demo}>
          <FixtureCard
            fixture={ARG_EGYPT_PROOF_FIXTURE}
            featured
            showMarketOdds
          />
        </div>
      </div>
    </main>
  );
}
