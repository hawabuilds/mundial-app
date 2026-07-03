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
  /** Show the "tap to reply" example (upcoming matches only). */
  withReply?: boolean;
};

export default function FixtureCard({
  fixture,
  featured = false,
  withReply = false,
}: FixtureCardProps) {
  const { line: kickoffLocal, ready } = useLocalKickoff(fixture.date, fixture.time);

  const inPlay = fixture.status === "LIVE" || fixture.status === "HT";
  const finished = fixture.status === "FT";
  const showLive = inPlay || finished;
  const hasScore = fixture.homeScore != null && fixture.awayScore != null;

  const pillText =
    fixture.status === "HT"
      ? "HT"
      : finished
        ? "FT"
        : fixture.elapsed != null
          ? `LIVE ${fixture.elapsed}'`
          : "LIVE";

  const homeGoals = fixture.goals.filter((g) => g.side === "home");
  const awayGoals = fixture.goals.filter((g) => g.side === "away");

  const renderScorers = (goals: typeof fixture.goals) =>
    showLive && goals.length > 0 ? (
      <ul className={styles.scorers}>
        {goals.map((goal, index) => (
          <li key={`${goal.minute}-${index}`} className={styles.scorer}>
            {goal.minute != null ? <span className={styles.scorerMin}>{goal.minute}&rsquo;</span> : null}
            <span className={styles.scorerName}>
              {goal.player ?? "Goal"}
              {goal.ownGoal ? " (OG)" : ""}
            </span>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <Card glow={featured} className={featured ? styles.featured : styles.compact}>
      <div className={styles.meta}>
        {fixture.group ? (
          <span className={styles.metaGroup}>{fixture.group}</span>
        ) : null}
        {showLive ? (
          <span
            className={`${styles.statusPill} ${
              inPlay ? styles.statusLive : styles.statusDone
            } ${fixture.group ? "" : styles.pillSolo}`}
          >
            {inPlay ? <span className={styles.pulse} aria-hidden /> : null}
            {pillText}
          </span>
        ) : (
          <span className={fixture.group ? undefined : styles.metaSolo}>
            {ready ? kickoffLocal : `${fixture.date} · ${fixture.time} UTC`}
          </span>
        )}
      </div>

      <div className={`${styles.matchup} ${showLive ? styles.matchupLive : ""}`}>
        <div className={styles.side}>
          <Flag code={fixture.homeCode} size={featured ? "lg" : "md"} />
          <span className={styles.team}>{fixture.home}</span>
          {renderScorers(homeGoals)}
        </div>
        {showLive && hasScore ? (
          <span className={styles.score}>
            {fixture.homeScore}
            <span className={styles.scoreDash}>–</span>
            {fixture.awayScore}
          </span>
        ) : (
          <span className={styles.vs}>vs</span>
        )}
        <div className={styles.side}>
          <Flag code={fixture.awayCode} size={featured ? "lg" : "md"} />
          <span className={styles.team}>{fixture.away}</span>
          {renderScorers(awayGoals)}
        </div>
      </div>

      {fixture.venueLine ? (
        <p className={styles.venue}>{fixture.venueLine}</p>
      ) : null}

      {withReply && !showLive ? <ExampleCallPreview fixture={fixture} /> : null}
    </Card>
  );
}
