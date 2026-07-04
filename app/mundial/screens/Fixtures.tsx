"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchBoardMatches,
  fetchMyLeaderboardStats,
  type UserScoreBreakdown,
} from "@/app/lib/leaderboard-client";
import { resolveCurrentMatch, sortFixturesByKickoffAsc, toMundialFixture, type MundialFixture } from "../lib/fixtures";
import Card from "../ui/Card";
import FixtureCard from "../ui/FixtureCard";
import GoalBallBurst, { type GoalBurstEvent } from "../ui/GoalBallBurst";
import ProfileMenu from "../ui/ProfileMenu";
import ScoringRules from "../ui/ScoringRules";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import styles from "./Fixtures.module.css";

function scoreLine(home: number, away: number): string {
  return `${home}-${away}`;
}

function findLiveMatch(fixtures: MundialFixture[]): MundialFixture | null {
  const inPlay = fixtures.find((f) => f.phase === "live");
  if (inPlay) return inPlay;
  return (
    fixtures.find(
      (f) =>
        f.status === "LIVE" ||
        f.status === "HT" ||
        f.status === "1H" ||
        f.status === "2H" ||
        f.status === "ET",
    ) ?? null
  );
}

type LiveScoreSnapshot = {
  id: number;
  home: number;
  away: number;
  goalCount: number;
};

type Props = {
  onTabChange: (t: TabId) => void;
  vaultDot?: boolean;
};

export default function Fixtures({ onTabChange, vaultDot }: Props) {
  const { status } = useSession();
  const [fixtures, setFixtures] = useState<MundialFixture[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [lastBreakdown, setLastBreakdown] = useState<UserScoreBreakdown | null>(
    null,
  );
  const [statsLoading, setStatsLoading] = useState(true);
  const liveScoreRef = useRef<LiveScoreSnapshot | null>(null);
  const [goalBurst, setGoalBurst] = useState<GoalBurstEvent | null>(null);
  const [goalBurstKey, setGoalBurstKey] = useState(0);

  const clearGoalBurst = useCallback(() => setGoalBurst(null), []);

  const liveOnBoard = fixtures.some((f) => f.phase === "live");

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void fetchBoardMatches()
        .then((rows) => {
          if (cancelled) return;
          setFixtures(rows.map(toMundialFixture));
        })
        .catch(() => {
          /* keep whatever we last had */
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    load();
    const interval = window.setInterval(load, liveOnBoard ? 5_000 : 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [liveOnBoard]);

  const liveMatch = findLiveMatch(fixtures);

  useEffect(() => {
    if (!liveMatch) {
      liveScoreRef.current = null;
      return;
    }

    const home = liveMatch.homeScore ?? 0;
    const away = liveMatch.awayScore ?? 0;
    const goalCount = liveMatch.goals.length;
    const prev = liveScoreRef.current;

    if (!prev || prev.id !== liveMatch.id) {
      liveScoreRef.current = { id: liveMatch.id, home, away, goalCount };
      return;
    }

    const scoreIncreased = home > prev.home || away > prev.away;
    const goalsIncreased = goalCount > prev.goalCount;

    if (scoreIncreased || goalsIncreased) {
      const latest = liveMatch.goals[liveMatch.goals.length - 1];
      const homeScored = home > prev.home;
      const awayScored = away > prev.away;
      const side: "home" | "away" =
        latest?.side ??
        (homeScored && !awayScored
          ? "home"
          : awayScored && !homeScored
            ? "away"
            : homeScored
              ? "home"
              : "away");

      setGoalBurstKey((key) => key + 1);
      setGoalBurst({
        side,
        player: latest?.player ?? null,
        ownGoal: latest?.ownGoal ?? false,
      });
    }

    liveScoreRef.current = { id: liveMatch.id, home, away, goalCount };
  }, [
    liveMatch?.id,
    liveMatch?.homeScore,
    liveMatch?.awayScore,
    liveMatch?.goals.length,
  ]);

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    setStatsLoading(true);
    void fetchMyLeaderboardStats()
      .then((stats) => {
        if (cancelled) return;
        setRank(stats.rank);
        setPoints(stats.total_points);
        setLastBreakdown(stats.last_breakdown);
      })
      .catch(() => {
        if (cancelled) return;
        setRank(null);
        setPoints(null);
        setLastBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const liveList = fixtures.filter(
    (f) => f.phase === "live" || f.phase === "recent",
  );
  const upcomingList = sortFixturesByKickoffAsc(
    fixtures.filter((f) => f.phase === "upcoming"),
  );

  const featuredLive = liveList[0] ?? null;
  const liveRest = liveList.slice(1);
  // Only the next game (soonest upcoming) gets a tap-to-reply prompt.
  const nextGame = upcomingList[0] ?? null;
  const comingUp = upcomingList.slice(1);

  const currentMatch = resolveCurrentMatch(fixtures);
  const showOddsFor = (fixture: MundialFixture): boolean =>
    Boolean(
      currentMatch &&
        fixture.id === currentMatch.id &&
        fixture.marketOdds,
    );

  const featuredLiveLabel = !featuredLive
    ? null
    : featuredLive.status === "LIVE" || featuredLive.status === "HT"
      ? "Live now"
      : "Full time";
  const rankLabel = statsLoading ? "—" : rank != null ? `#${rank}` : "—";
  const ptsLabel =
    statsLoading ? "—" : points != null ? points.toLocaleString() : "0";

  const lastPick = lastBreakdown
    ? (() => {
        const onBoard = fixtures.find((f) => f.id === lastBreakdown.match_id);
        return {
          ...lastBreakdown,
          home: onBoard?.home ?? lastBreakdown.home,
          away: onBoard?.away ?? lastBreakdown.away,
        };
      })()
    : null;

  return (
    <AppShell
      tab="fixtures"
      onTabChange={onTabChange}
      vaultDot={vaultDot}
      headerTrailing={<ProfileMenu />}
    >
      {liveMatch ? (
        <GoalBallBurst
          key={goalBurstKey}
          event={goalBurst}
          onDone={clearGoalBurst}
        />
      ) : null}
      <Card glow className={styles.stat}>
        <div className={styles.statBlock}>
          <p className="m-label">Your place</p>
          <p className={styles.statNum}>{rankLabel}</p>
        </div>
        <div className={styles.statRule} />
        <div className={styles.statBlock}>
          <p className="m-label">Points</p>
          <p className={styles.statPts}>{ptsLabel}</p>
        </div>
      </Card>

      <ScoringRules />

      {lastPick ? (
        <div className={styles.lastPick}>
          <p className={styles.lastPickLabel}>Last match scored</p>
          <p className={styles.lastPickMatch}>
            {lastPick.home} vs {lastPick.away}
          </p>
          <p className={styles.lastPickDetail}>
            Your pick{" "}
            <strong>
              {scoreLine(lastPick.prediction.home, lastPick.prediction.away)}
            </strong>
            {lastPick.final ? (
              <>
                {" "}
                · Final{" "}
                <strong>
                  {scoreLine(lastPick.final.home, lastPick.final.away)}
                </strong>
              </>
            ) : null}
          </p>
          <p className={styles.lastPickPts}>+{lastPick.points} points</p>
        </div>
      ) : null}

      {!loaded ? (
        <p className={styles.emptyFixtures}>Loading matches…</p>
      ) : fixtures.length === 0 ? (
        <p className={styles.emptyFixtures}>No matches right now. Check back soon.</p>
      ) : (
        <>
          {featuredLive ? (
            <section className={styles.section}>
              <p className="m-label">{featuredLiveLabel}</p>
              <FixtureCard
                fixture={featuredLive}
                featured
                showMarketOdds={showOddsFor(featuredLive)}
              />
              {liveRest.length > 0 ? (
                <ul className={styles.list}>
                  {liveRest.map((f) => (
                    <li key={f.id}>
                      <FixtureCard fixture={f} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {nextGame ? (
            <section className={styles.section}>
              <p className="m-label">Next whistle</p>
              <FixtureCard
                fixture={nextGame}
                featured
                withReply
                showMarketOdds={showOddsFor(nextGame)}
              />
            </section>
          ) : null}

          {comingUp.length > 0 ? (
            <section className={styles.section}>
              <p className="m-label">Coming up</p>
              <ul className={styles.list}>
                {comingUp.map((f) => (
                  <li key={f.id}>
                    <FixtureCard fixture={f} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <p className={styles.tzNote}>Kickoff times shown in your local timezone.</p>
    </AppShell>
  );
}
