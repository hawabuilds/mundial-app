"use client";

import { useEffect, useState } from "react";
import { fetchBoardMatches } from "@/app/lib/leaderboard-client";
import { toMundialFixture, type MundialFixture } from "../lib/fixtures";
import ExampleCallPreview from "../ui/ExampleCallPreview";
import Flag from "../ui/Flag";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import { useLocalKickoff } from "../lib/kickoff";
import Card from "../ui/Card";
import styles from "./Call.module.css";

type Props = {
  onTabChange: (t: TabId) => void;
  vaultDot?: boolean;
};

function MatchSummary({ fixture }: { fixture: MundialFixture }) {
  const { line: kickoffLocal, ready } = useLocalKickoff(fixture.date, fixture.time);
  const kickoff = ready ? kickoffLocal : `${fixture.date} · ${fixture.time} UTC`;

  return (
    <Card glow className={styles.match}>
      <div className={styles.meta}>
        {fixture.group ? (
          <span className={styles.metaGroup}>{fixture.group}</span>
        ) : null}
        <span className={fixture.group ? undefined : styles.metaSolo}>{kickoff}</span>
      </div>

      <div className={styles.matchup}>
        <div className={styles.side}>
          <Flag code={fixture.homeCode} size="xl" />
          <span className={styles.team}>{fixture.home}</span>
        </div>
        <span className={styles.vs}>vs</span>
        <div className={styles.side}>
          <Flag code={fixture.awayCode} size="xl" />
          <span className={styles.team}>{fixture.away}</span>
        </div>
      </div>

      <p className={styles.venue}>{fixture.venueLine}</p>
    </Card>
  );
}

export default function Call({ onTabChange, vaultDot }: Props) {
  const [fixture, setFixture] = useState<MundialFixture | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void fetchBoardMatches()
        .then((rows) => {
          if (cancelled) return;
          // Next game to reply to = soonest upcoming match on the live board.
          const next = rows.find((r) => r.phase === "upcoming") ?? rows[0];
          setFixture(next ? toMundialFixture(next) : null);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <AppShell tab="call" onTabChange={onTabChange} vaultDot={vaultDot}>
      <div className={styles.intro}>
        <h2 className="m-headline">Reply on X</h2>
        <p className="m-body">
          Post your scoreline as a reply on the match thread before kickoff.
        </p>
      </div>

      {!loaded ? (
        <p className="m-body">Loading the next match…</p>
      ) : fixture ? (
        <>
          <MatchSummary fixture={fixture} />
          <ExampleCallPreview fixture={fixture} />
        </>
      ) : (
        <p className="m-body">No upcoming match right now — check back soon.</p>
      )}
    </AppShell>
  );
}
