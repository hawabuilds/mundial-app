"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  fetchBoardMatches,
  fetchMyLeaderboardStats,
} from "@/app/lib/leaderboard-client";
import { FALLBACK_FIXTURES, toMundialFixture, type MundialFixture } from "../lib/fixtures";
import Card from "../ui/Card";
import FixtureCard from "../ui/FixtureCard";
import ProfileMenu from "../ui/ProfileMenu";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import styles from "./Fixtures.module.css";

type Props = {
  onTabChange: (t: TabId) => void;
  vaultDot?: boolean;
};

export default function Fixtures({ onTabChange, vaultDot }: Props) {
  const { status } = useSession();
  const [fixtures, setFixtures] = useState<MundialFixture[]>(FALLBACK_FIXTURES);
  const [rank, setRank] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void fetchBoardMatches()
        .then((rows) => {
          if (cancelled) return;
          if (rows.length === 0) {
            setFixtures([]);
            return;
          }
          setFixtures(rows.map(toMundialFixture));
        })
        .catch(() => {
          /* keep fallback */
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
      })
      .catch(() => {
        if (cancelled) return;
        setRank(null);
        setPoints(null);
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
  const upcomingList = fixtures.filter((f) => f.phase === "upcoming");

  // The next 4 upcoming matches get a "tap to reply" prompt.
  const replyIds = new Set(upcomingList.slice(0, 4).map((f) => f.id));

  const featuredIsLive = liveList.length > 0;
  const headline = liveList[0] ?? upcomingList[0] ?? null;
  const liveRest = featuredIsLive ? liveList.slice(1) : [];
  const upcomingToList = featuredIsLive ? upcomingList : upcomingList.slice(1);

  const headlineLabel = !headline
    ? null
    : headline.status === "LIVE" || headline.status === "HT"
      ? "Live now"
      : headline.status === "FT" || headline.phase === "recent"
        ? "Full time"
        : "Next whistle";
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

      {headline ? (
        <section className={styles.section}>
          <p className="m-label">{headlineLabel}</p>
          <FixtureCard
            fixture={headline}
            featured
            withReply={replyIds.has(headline.id)}
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
      ) : (
        <p className={styles.emptyFixtures}>No upcoming matches — check back soon.</p>
      )}

      {upcomingToList.length > 0 ? (
        <section className={styles.section}>
          <p className="m-label">Coming up</p>
          <ul className={styles.list}>
            {upcomingToList.map((f) => (
              <li key={f.id}>
                <FixtureCard fixture={f} withReply={replyIds.has(f.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={styles.tzNote}>Kickoff times shown in your local timezone.</p>
    </AppShell>
  );
}
