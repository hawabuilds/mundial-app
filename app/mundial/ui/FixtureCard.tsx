"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MundialFixture, MundialGoal } from "../lib/fixtures";
import { useLocalKickoff } from "../lib/kickoff";
import Card from "./Card";
import ExampleCallPreview from "./ExampleCallPreview";
import Flag from "./Flag";
import GoalBallBurst, { type GoalBurstEvent } from "./GoalBallBurst";
import MarketOddsLine from "./MarketOddsLine";
import styles from "./FixtureCard.module.css";

type FixtureCardProps = {
  fixture: MundialFixture;
  featured?: boolean;
  /** Show the "tap to reply" example (upcoming matches only). */
  withReply?: boolean;
  /** Show TxLINE market odds (must be set explicitly for the current match only). */
  showMarketOdds?: boolean;
};

type GroupedScorer = {
  side: "home" | "away";
  player: string | null;
  ownGoal: boolean;
  minutes: number[];
};

/** One row per scorer; multiple goals by the same player share a line. */
function groupScorersByPlayer(goals: MundialGoal[]): GroupedScorer[] {
  const rows: GroupedScorer[] = [];
  const byPlayer = new Map<string, GroupedScorer>();

  for (const goal of goals) {
    if (!goal.player) {
      rows.push({
        side: goal.side,
        player: null,
        ownGoal: goal.ownGoal,
        minutes: goal.minute != null ? [goal.minute] : [],
      });
      continue;
    }

    const key = `${goal.player}|${goal.ownGoal ? 1 : 0}`;
    let row = byPlayer.get(key);
    if (!row) {
      row = {
        side: goal.side,
        player: goal.player,
        ownGoal: goal.ownGoal,
        minutes: [],
      };
      byPlayer.set(key, row);
      rows.push(row);
    }
    if (goal.minute != null && !row.minutes.includes(goal.minute)) {
      row.minutes.push(goal.minute);
    }
  }

  for (const row of rows) {
    row.minutes.sort((a, b) => a - b);
  }
  return rows;
}

function formatGoalMinutes(minutes: number[]): string {
  return minutes.map((m) => `${m}\u2019`).join(", ");
}

/** e.g. "Lionel Messi" → "L. Messi" */
function formatScorerShortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name;
  if (parts.length === 1) return parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${parts[0]!.charAt(0).toUpperCase()}. ${last}`;
}

export default function FixtureCard({
  fixture,
  featured = false,
  withReply = false,
  showMarketOdds = false,
}: FixtureCardProps) {
  const { line: kickoffLine } = useLocalKickoff(
    fixture.date,
    fixture.time,
    fixture.kickoffUtcMs,
  );
  const prevGoalCount = useRef(fixture.goals.length);
  const [newGoalKey, setNewGoalKey] = useState<string | null>(null);
  const [goalBurst, setGoalBurst] = useState<GoalBurstEvent | null>(null);
  const [scorePop, setScorePop] = useState(false);

  const clearGoalBurst = useCallback(() => setGoalBurst(null), []);

  useEffect(() => {
    const inPlayNow =
      fixture.status === "LIVE" ||
      fixture.status === "HT" ||
      fixture.phase === "live";

    if (fixture.goals.length <= prevGoalCount.current) {
      prevGoalCount.current = fixture.goals.length;
      return;
    }

    const latest = fixture.goals[fixture.goals.length - 1];
    const key = `${latest?.side}-${latest?.minute}-${latest?.player}`;
    setNewGoalKey(key);
    setScorePop(true);

    if (featured && inPlayNow && latest) {
      setGoalBurst({
        side: latest.side,
        player: latest.player,
        ownGoal: latest.ownGoal,
      });
    }

    prevGoalCount.current = fixture.goals.length;
  }, [fixture.goals, fixture.status, fixture.phase, featured]);

  useEffect(() => {
    if (!scorePop) return;
    const timer = window.setTimeout(() => setScorePop(false), 900);
    return () => window.clearTimeout(timer);
  }, [scorePop]);

  const inPlay =
    fixture.status === "LIVE" ||
    fixture.status === "HT" ||
    fixture.phase === "live";
  const finished = fixture.status === "FT" || fixture.phase === "recent";
  const showLive = inPlay || finished;
  const hasScore = fixture.homeScore != null && fixture.awayScore != null;
  const showOdds = showMarketOdds && fixture.marketOdds;

  const pillText =
    fixture.status === "HT"
      ? "HT"
      : finished
        ? "FT · Settled via TxLINE"
        : fixture.elapsed != null
          ? `LIVE ${fixture.elapsed}'`
          : "LIVE";

  const homeGoals = fixture.goals.filter((g) => g.side === "home");
  const awayGoals = fixture.goals.filter((g) => g.side === "away");

  const renderScorers = (goals: typeof fixture.goals) =>
    showLive && goals.length > 0 ? (
      <ul className={styles.scorers}>
        {groupScorersByPlayer(goals).map((row, index) => {
          const key = `${row.player ?? "unknown"}-${row.minutes.join("-")}-${index}`;
          const isNew = goals.some(
            (goal) =>
              newGoalKey === `${goal.side}-${goal.minute}-${goal.player}` &&
              goal.player === row.player &&
              goal.ownGoal === row.ownGoal,
          );
          return (
            <li
              key={key}
              className={`${styles.scorer}${isNew ? ` ${styles.scorerFlash}` : ""}`}
            >
              <span className={styles.scorerLine}>
                {row.minutes.length > 0 ? (
                  <span className={styles.scorerMin}>
                    {formatGoalMinutes(row.minutes)}
                  </span>
                ) : null}
                {row.player ? (
                  <>
                    {row.minutes.length > 0 ? " " : null}
                    <span className={styles.scorerName}>
                      {formatScorerShortName(row.player)}
                      {row.ownGoal ? " (OG)" : ""}
                    </span>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <>
      {featured ? (
        <GoalBallBurst event={goalBurst} onDone={clearGoalBurst} />
      ) : null}
      <Card glow={featured} className={featured ? styles.featured : styles.compact}>
      <div className={styles.meta}>
        {fixture.stage ? (
          <span className={styles.metaGroup}>{fixture.stage}</span>
        ) : null}
        {showLive ? (
          <span
            className={`${styles.statusPill} ${
              inPlay ? styles.statusLive : styles.statusDone
            } ${finished ? styles.statusSettled : ""} ${
              fixture.stage ? "" : styles.pillSolo
            }`}
          >
            {inPlay ? <span className={styles.pulse} aria-hidden /> : null}
            {pillText}
          </span>
        ) : (
          <span className={fixture.stage ? undefined : styles.metaSolo} suppressHydrationWarning>
            {kickoffLine}
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
          <span
            className={`${styles.score}${scorePop ? ` ${styles.scorePop}` : ""}`}
          >
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

      {showOdds && fixture.marketOdds ? (
        <MarketOddsLine
          home={fixture.home}
          away={fixture.away}
          odds={fixture.marketOdds}
          locked={showLive}
          compact={!featured && showLive}
          hideHint
        />
      ) : null}

      {withReply && !showLive ? <ExampleCallPreview fixture={fixture} /> : null}
    </Card>
    </>
  );
}
