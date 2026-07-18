"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchBoardMatches,
  fetchFirstGoalscorerOpportunities,
  fetchMyLeaderboardStats,
  type FirstGoalscorerOpportunity,
  type UserScoreBreakdown,
} from "@/app/lib/leaderboard-client";
import { goalScorerDisplayName } from "@/lib/playerDisplayName";
import {
  resolveCurrentMatch,
  sortFixturesByKickoffAsc,
  toMundialFixture,
  type MundialFixture,
} from "../lib/fixtures";
import Card from "../ui/Card";
import FirstGoalscorerBanner from "../ui/FirstGoalscorerBanner";
import FirstGoalscorerPicker from "../ui/FirstGoalscorerPicker";
import FixtureCard from "../ui/FixtureCard";
import GoalMomentOverlay from "../ui/GoalMomentOverlay";
import type { GoalCelebration } from "../ui/goalCelebration";
import ProfileMenu from "../ui/ProfileMenu";
import ScoringRules from "../ui/ScoringRules";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import styles from "./Fixtures.module.css";

function scoreLine(home: number, away: number): string {
  return `${home}-${away}`;
}

function fixtureKickoffMs(fixture: MundialFixture): number {
  if (fixture.kickoffUtcMs != null && Number.isFinite(fixture.kickoffUtcMs)) {
    return fixture.kickoffUtcMs;
  }
  if (fixture.date && fixture.time) {
    return Date.parse(`${fixture.date}T${fixture.time}:00Z`);
  }
  return Number.POSITIVE_INFINITY;
}

function isFixtureLocked(fixture: MundialFixture): boolean {
  const kickoffMs = fixtureKickoffMs(fixture);
  return Number.isFinite(kickoffMs) && Date.now() >= kickoffMs;
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
        f.status === "ET" ||
        f.status === "P",
    ) ?? null
  );
}

type LiveScoreSnapshot = {
  id: number;
  home: number;
  away: number;
  goalCount: number;
};

function enrichGoalCelebration(
  current: GoalCelebration,
  liveMatch: MundialFixture,
): GoalCelebration {
  const home = liveMatch.homeScore ?? 0;
  const away = liveMatch.awayScore ?? 0;
  const sideGoal =
    liveMatch.goals.filter((g) => g.side === current.side).at(-1) ??
    liveMatch.goals[liveMatch.goals.length - 1] ??
    null;
  const nextHome = Math.max(current.homeScore, home);
  const nextAway = Math.max(current.awayScore, away);
  const nextPlayer =
    current.player ?? (sideGoal ? goalScorerDisplayName(sideGoal) : null);
  const nextMinute = current.minute ?? sideGoal?.minute ?? null;
  const nextPenalty = current.penalty || (sideGoal?.penalty ?? false);
  const nextOwnGoal = current.ownGoal || (sideGoal?.ownGoal ?? false);
  if (
    nextHome === current.homeScore &&
    nextAway === current.awayScore &&
    nextPlayer === current.player &&
    nextMinute === current.minute &&
    nextPenalty === current.penalty &&
    nextOwnGoal === current.ownGoal
  ) {
    return current;
  }
  return {
    ...current,
    homeScore: nextHome,
    awayScore: nextAway,
    player: nextPlayer,
    minute: nextMinute,
    penalty: nextPenalty,
    ownGoal: nextOwnGoal,
  };
}

function syncGoalCelebration(
  liveMatch: MundialFixture | null,
  prev: LiveScoreSnapshot | null,
  current: GoalCelebration | null,
): GoalCelebration | null {
  if (!liveMatch) return null;

  const home = liveMatch.homeScore ?? 0;
  const away = liveMatch.awayScore ?? 0;
  const goalCount = liveMatch.goals.length;

  if (!prev || prev.id !== liveMatch.id) {
    return null;
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

    if (
      current &&
      current.matchId === liveMatch.id &&
      home <= current.homeScore &&
      away <= current.awayScore
    ) {
      return enrichGoalCelebration(current, liveMatch);
    }

    return {
      key: Date.now(),
      matchId: liveMatch.id,
      side,
      player: latest ? goalScorerDisplayName(latest) : null,
      ownGoal: latest?.ownGoal ?? false,
      minute: latest?.minute ?? null,
      penalty: latest?.penalty ?? false,
      home: liveMatch.home,
      away: liveMatch.away,
      homeCode: liveMatch.homeCode,
      awayCode: liveMatch.awayCode,
      homeScore: home,
      awayScore: away,
      prevHomeScore: prev.home,
      prevAwayScore: prev.away,
    };
  }

  if (current && current.matchId === liveMatch.id) {
    return enrichGoalCelebration(current, liveMatch);
  }

  return current;
}

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
  const [firstGoalscorerOps, setFirstGoalscorerOps] = useState<
    FirstGoalscorerOpportunity[]
  >([]);
  const [pickerMatchId, setPickerMatchId] = useState<number | null>(null);
  const liveScoreRef = useRef<LiveScoreSnapshot | null>(null);
  const [goalCelebration, setGoalCelebration] = useState<GoalCelebration | null>(
    null,
  );

  const clearGoalCelebration = useCallback(() => setGoalCelebration(null), []);

  const liveOnBoard = fixtures.some((f) => f.phase === "live");

  const applyBoardRows = useCallback((rows: Awaited<ReturnType<typeof fetchBoardMatches>>) => {
    const mundial = rows.map(toMundialFixture);
    const live = findLiveMatch(mundial);
    const prev = liveScoreRef.current;

    if (live) {
      const home = live.homeScore ?? 0;
      const away = live.awayScore ?? 0;
      const goalCount = live.goals.length;

      if (!prev || prev.id !== live.id) {
        liveScoreRef.current = { id: live.id, home, away, goalCount };
      } else {
        setGoalCelebration((current) =>
          syncGoalCelebration(live, prev, current),
        );
        liveScoreRef.current = { id: live.id, home, away, goalCount };
      }
    } else {
      liveScoreRef.current = null;
      setGoalCelebration(null);
    }

    setFixtures(mundial);
  }, []);

  // First paint: board + leaderboard stats together so "Last match scored" lands with cards.
  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    setLoaded(false);
    setStatsLoading(true);

    const boardPromise = fetchBoardMatches();
    const statsPromise =
      status === "authenticated"
        ? fetchMyLeaderboardStats()
        : Promise.resolve(null);

    void Promise.all([boardPromise, statsPromise])
      .then(([rows, stats]) => {
        if (cancelled) return;
        applyBoardRows(rows);
        if (stats) {
          setRank(stats.rank);
          setPoints(stats.total_points);
          setLastBreakdown(stats.last_breakdown);
        } else {
          setRank(null);
          setPoints(null);
          setLastBreakdown(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRank(null);
        setPoints(null);
        setLastBreakdown(null);
      })
      .finally(() => {
        if (cancelled) return;
        setStatsLoading(false);
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status, applyBoardRows]);

  // Live / idle board polling only (stats stay from the first paint / session).
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    const load = () => {
      void fetchBoardMatches()
        .then((rows) => {
          if (cancelled) return;
          applyBoardRows(rows);
        })
        .catch(() => {
          /* keep whatever we last had */
        });
    };

    const interval = window.setInterval(load, liveOnBoard ? 5_000 : 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loaded, liveOnBoard, applyBoardRows]);

  // Stable key so live score polls (same upcoming IDs) do not re-fetch ops.
  const upcomingIdsKey = fixtures
    .filter((f) => f.phase === "upcoming")
    .map((f) => f.id)
    .join(",");

  const refreshFirstGoalscorerOps = useCallback(() => {
    if (status === "loading" || !loaded) return;

    if (status !== "authenticated") {
      setFirstGoalscorerOps([]);
      return;
    }

    const upcomingIds = upcomingIdsKey
      ? upcomingIdsKey.split(",").map((id) => Number(id))
      : [];
    if (upcomingIds.length === 0) {
      setFirstGoalscorerOps([]);
      return;
    }

    void fetchFirstGoalscorerOpportunities(upcomingIds)
      .then(setFirstGoalscorerOps)
      .catch(() => {
        /* keep last good ops on transient failure */
      });
  }, [upcomingIdsKey, loaded, status]);

  useEffect(() => {
    refreshFirstGoalscorerOps();
  }, [refreshFirstGoalscorerOps]);

  const firstGoalscorerByMatchId = new Map(
    firstGoalscorerOps.map((op) => [op.match_id, op]),
  );

  const pendingFirstGoalscorerFixtures = sortFixturesByKickoffAsc(
    fixtures.filter((fixture) => {
      if (fixture.phase !== "upcoming") return false;
      const op = firstGoalscorerByMatchId.get(fixture.id);
      if (!op?.hasScorePrediction || op.hasFirstGoalscorerPrediction) return false;
      return !isFixtureLocked(fixture);
    }),
  );

  const bannerFixture = pendingFirstGoalscorerFixtures[0] ?? null;
  const bannerExtraCount = Math.max(0, pendingFirstGoalscorerFixtures.length - 1);
  const hasBonusBanner = bannerFixture != null;

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

  // Show with the board once first paint is ready — do not wait on bonus-ops fetch.
  const showLastPick = Boolean(lastPick && loaded && !hasBonusBanner);

  const renderBonusBanner = (fixture: MundialFixture, sticky = false) => {
    if (pickerMatchId != null) return null;
    if (!bannerFixture || bannerFixture.id !== fixture.id) return null;
    return (
      <FirstGoalscorerBanner
        extraCount={bannerExtraCount}
        sticky={sticky}
        onOpen={() => setPickerMatchId(fixture.id)}
      />
    );
  };

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
    : featuredLive.phase === "live" ||
        featuredLive.status === "LIVE" ||
        featuredLive.status === "HT" ||
        featuredLive.status === "1H" ||
        featuredLive.status === "2H" ||
        featuredLive.status === "ET" ||
        featuredLive.status === "P"
      ? featuredLive.status === "P"
        ? "Penalties"
        : "Live now"
      : "Full time";
  const rankLabel = statsLoading ? "—" : rank != null ? `#${rank}` : "—";
  const ptsLabel =
    statsLoading ? "—" : points != null ? points.toLocaleString() : "0";

  return (
    <AppShell
      tab="fixtures"
      onTabChange={onTabChange}
      vaultDot={vaultDot}
      headerTrailing={<ProfileMenu />}
    >
      {pickerMatchId != null ? (
        <FirstGoalscorerPicker
          matchId={pickerMatchId}
          onClose={() => setPickerMatchId(null)}
          onSaved={refreshFirstGoalscorerOps}
        />
      ) : null}
      {goalCelebration ? (
        <GoalMomentOverlay
          event={goalCelebration}
          onDone={clearGoalCelebration}
        />
      ) : null}
      <Card glow={!hasBonusBanner} className={styles.stat}>
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

      {showLastPick && lastPick ? (
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
                celebration={goalCelebration}
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
              {renderBonusBanner(nextGame, true)}
              <FixtureCard
                fixture={nextGame}
                featured
                glow={!hasBonusBanner || bannerFixture?.id !== nextGame.id}
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
                    {renderBonusBanner(f)}
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
