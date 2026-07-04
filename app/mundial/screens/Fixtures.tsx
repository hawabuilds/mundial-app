"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchBoardMatches,
  fetchMyLeaderboardStats,
  type UserScoreBreakdown,
} from "@/app/lib/leaderboard-client";
import { sortFixturesByKickoffAsc, toMundialFixture, type MundialFixture } from "../lib/fixtures";
import Card from "../ui/Card";
import FixtureCard from "../ui/FixtureCard";
import ProfileMenu from "../ui/ProfileMenu";
import ScoringRules from "../ui/ScoringRules";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import styles from "./Fixtures.module.css";
import { formatPointsBreakdown } from "@/lib/scoring";

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
    // Poll often enough to keep the live clock + score fresh during a match.
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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

  const featuredLiveLabel = !featuredLive
    ? null
    : featuredLive.status === "LIVE" || featuredLive.status === "HT"
      ? "Live now"
      : "Full time";
  const rankLabel = statsLoading ? "—" : rank != null ? `#${rank}` : "—";
  const ptsLabel =
    statsLoading ? "—" : points != null ? points.toLocaleString() : "0";
  const lastScoreLine =
    lastBreakdown?.final != null
      ? `${lastBreakdown.prediction.home}–${lastBreakdown.prediction.away} → ${lastBreakdown.final.home}–${lastBreakdown.final.away}`
      : lastBreakdown
        ? `${lastBreakdown.prediction.home}–${lastBreakdown.prediction.away}`
        : null;
  const lastPointsLine = lastBreakdown
    ? formatPointsBreakdown(lastBreakdown)
    : null;

  return (
    <AppShell
      tab="fixtures"
      onTabChange={onTabChange}
      vaultDot={vaultDot}
      headerTrailing={<ProfileMenu />}
    >
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

      {lastScoreLine && lastPointsLine ? (
        <p className={styles.lastScore}>
          Last call · {lastScoreLine}
          <span className={styles.lastScorePts}>{lastPointsLine}</span>
        </p>
      ) : null}

      {!loaded ? (
        <p className={styles.emptyFixtures}>Loading matches…</p>
      ) : fixtures.length === 0 ? (
        <p className={styles.emptyFixtures}>No matches right now — check back soon.</p>
      ) : (
        <>
          {featuredLive ? (
            <section className={styles.section}>
              <p className="m-label">{featuredLiveLabel}</p>
              <FixtureCard
                fixture={featuredLive}
                featured
                showMarketOdds={Boolean(featuredLive.marketOdds)}
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
                showMarketOdds={Boolean(nextGame.marketOdds)}
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
