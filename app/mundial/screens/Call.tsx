"use client";

import { useEffect, useState } from "react";
import { fetchBoardMatches } from "@/app/lib/leaderboard-client";
import { resolveCurrentMatch, sortFixturesByKickoffAsc, toMundialFixture, type MundialFixture } from "../lib/fixtures";
import ExampleCallPreview from "../ui/ExampleCallPreview";
import Flag from "../ui/Flag";
import MarketOddsLine from "../ui/MarketOddsLine";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import { useLocalKickoff } from "../lib/kickoff";
import Card from "../ui/Card";
import styles from "./Call.module.css";

type Props = {
  onTabChange: (t: TabId) => void;
  vaultDot?: boolean;
};

function MatchSummary({
  fixture,
  showMarketOdds,
}: {
  fixture: MundialFixture;
  showMarketOdds: boolean;
}) {
  const { line: kickoffLine } = useLocalKickoff(
    fixture.date,
    fixture.time,
    fixture.kickoffUtcMs,
  );

  return (
    <Card glow className={styles.match}>
      <div className={styles.meta}>
        {fixture.stage ? (
          <span className={styles.metaGroup}>{fixture.stage}</span>
        ) : null}
        <span className={fixture.stage ? undefined : styles.metaSolo} suppressHydrationWarning>
          {kickoffLine}
        </span>
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

      {showMarketOdds && fixture.marketOdds ? (
        <MarketOddsLine home={fixture.home} away={fixture.away} odds={fixture.marketOdds} />
      ) : null}

      {fixture.venueLine ? (
        <p className={styles.venue}>{fixture.venueLine}</p>
      ) : null}
    </Card>
  );
}

export default function Call({ onTabChange, vaultDot }: Props) {
  const [fixture, setFixture] = useState<MundialFixture | null>(null);
  const [showMarketOdds, setShowMarketOdds] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void fetchBoardMatches()
        .then((rows) => {
          if (cancelled) return;
          const mundial = rows.map(toMundialFixture);
          const current = resolveCurrentMatch(mundial);
          const next =
            sortFixturesByKickoffAsc(mundial.filter((r) => r.phase === "upcoming"))[0] ??
            mundial[0];
          setFixture(next ?? null);
          setShowMarketOdds(Boolean(next && current && next.id === current.id));
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
          <MatchSummary fixture={fixture} showMarketOdds={showMarketOdds} />
          <ExampleCallPreview fixture={fixture} />
        </>
      ) : (
        <p className="m-body">No upcoming match right now — check back soon.</p>
      )}
    </AppShell>
  );
}
