"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchTxLineProof } from "@/app/lib/leaderboard-client";
import {
  PROOF_TERMINAL_FALLBACK_FOOTNOTE,
  proofPopoverCopy,
} from "@/lib/txScoreProofSemantics";
import styles from "./TxLineProofPopover.module.css";

function truncateProofRef(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatStats(
  stats: Array<{ key: number; value: number; period: number }>,
): string | null {
  if (stats.length === 0) return null;
  return stats
    .map((stat) => `key ${stat.key}=${stat.value} (period ${stat.period})`)
    .join(" · ");
}

type TxLineProofPopoverProps = {
  proof: MatchTxLineProof;
};

export default function TxLineProofPopover({ proof }: TxLineProofPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const officialLine = formatStats(proof.officialStats ?? []);
  const regulationLine = formatStats(
    proof.regulationStats?.length ? proof.regulationStats : proof.stats,
  );
  const hasOfficial = Boolean(officialLine);
  const hasRegulation = Boolean(regulationLine);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.pill} ${styles.pillVerified}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        TxLINE verified
      </button>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="TxLINE proof details">
          <p className={styles.title}>TxLINE on-chain proof</p>
          {proof.verificationCopy ? (
            <p className={styles.intro}>{proof.verificationCopy}</p>
          ) : null}
          {hasOfficial ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>Official result (finalised)</p>
              <p className={styles.sectionCopy}>{proofPopoverCopy("total")}</p>
              {proof.officialSeq != null ? (
                <p className={styles.sectionMeta}>Seq {proof.officialSeq}</p>
              ) : null}
              <p className={styles.sectionStats}>{officialLine}</p>
            </section>
          ) : null}
          {hasRegulation ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>Regulation score (settlement basis)</p>
              <p className={styles.sectionCopy}>{proofPopoverCopy("regulation")}</p>
              {(proof.regulationSeq ?? proof.seq) != null ? (
                <p className={styles.sectionMeta}>
                  Seq {proof.regulationSeq ?? proof.seq}
                </p>
              ) : null}
              <p className={styles.sectionStats}>{regulationLine}</p>
            </section>
          ) : null}
          {proof.seqSource === "terminal_fallback" ? (
            <p className={styles.fallbackNote}>{PROOF_TERMINAL_FALLBACK_FOOTNOTE}</p>
          ) : null}
          <dl className={styles.meta}>
            <div>
              <dt>TxLINE fixture</dt>
              <dd>{proof.txFixtureId}</dd>
            </div>
            {proof.proofReference ? (
              <div>
                <dt>Subtree root</dt>
                <dd title={proof.proofReference}>
                  {truncateProofRef(proof.proofReference, 10, 8)}
                </dd>
              </div>
            ) : null}
          </dl>
          {proof.solanaExplorerUrl ? (
            <a
              className={styles.link}
              href={proof.solanaExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View daily scores Merkle root on Solana Explorer
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
