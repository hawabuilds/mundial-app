"use client";

import type { MundialFixture } from "../lib/fixtures";
import { useLocalKickoff } from "../lib/kickoff";
import Card from "./Card";
import ExampleCallPreview from "./ExampleCallPreview";
import Flag from "./Flag";
import styles from "./FixtureCard.module.css";

type FixtureCardProps = {
  fixture: MundialFixture;
  featured?: boolean;
};

export default function FixtureCard({ fixture, featured = false }: FixtureCardProps) {
  const { line: kickoffLocal, ready } = useLocalKickoff(fixture.date, fixture.time);

  return (
    <Card glow={featured} className={featured ? styles.featured : styles.compact}>
      <div className={styles.meta}>
        {fixture.group ? (
          <span className={styles.metaGroup}>{fixture.group}</span>
        ) : null}
        <span className={fixture.group ? undefined : styles.metaSolo}>
          {ready ? kickoffLocal : `${fixture.date} · ${fixture.time} UTC`}
        </span>
      </div>

      <div className={styles.matchup}>
        <div className={styles.side}>
          <Flag code={fixture.homeCode} size={featured ? "lg" : "md"} />
          <span className={styles.team}>{fixture.home}</span>
        </div>
        <span className={styles.vs}>vs</span>
        <div className={styles.side}>
          <Flag code={fixture.awayCode} size={featured ? "lg" : "md"} />
          <span className={styles.team}>{fixture.away}</span>
        </div>
      </div>

      <p className={styles.venue}>{fixture.venueLine}</p>

      {featured ? <ExampleCallPreview fixture={fixture} /> : null}
    </Card>
  );
}
