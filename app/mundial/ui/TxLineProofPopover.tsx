"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchTxLineProof } from "@/app/lib/leaderboard-client";
import styles from "./TxLineProofPopover.module.css";

function truncateProofRef(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
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

  const statLine =
    proof.stats.length > 0
      ? proof.stats
          .map((stat) => `key ${stat.key}=${stat.value} (period ${stat.period})`)
          .join(" · ")
      : null;

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
            <p className={styles.copy}>{proof.verificationCopy}</p>
          ) : null}
          <dl className={styles.meta}>
            <div>
              <dt>TxLINE fixture</dt>
              <dd>{proof.txFixtureId}</dd>
            </div>
            <div>
              <dt>Scores seq</dt>
              <dd>{proof.seq}</dd>
            </div>
            {proof.proofReference ? (
              <div>
                <dt>Subtree root</dt>
                <dd title={proof.proofReference}>
                  {truncateProofRef(proof.proofReference, 10, 8)}
                </dd>
              </div>
            ) : null}
            {statLine ? (
              <div>
                <dt>Stats proved</dt>
                <dd>{statLine}</dd>
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
