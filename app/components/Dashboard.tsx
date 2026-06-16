"use client";

import { useTranslations } from "next-intl";
import { DM_Mono, Outfit } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  getUpcomingFixtures,
  getNextKickoffSlotFixtures,
  getUpcomingFixturesOnDate,
  type Fixture,
} from "../data/fixtures";
import { TROPHY_SRC } from "./dashboard-assets/trophy";
import {
  fetchMyLeaderboardStats,
  fetchUpcomingMatches,
  type UpcomingMatch,
} from "../lib/leaderboard-client";
import { fetchClaimableRewards } from "../lib/claimable-rewards-client";
import { bnbStr, usd } from "../data/rewards";
import AppShell from "./AppShell";
import MatchCard, { MatchCardEmpty } from "./MatchCard";
import PredictionModal from "./PredictionModal";
import styles from "./Dashboard.module.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

type DashboardProps = {
  onGoToLeaderboard: () => void;
  onGoToWallet: () => void;
  onGoToClaim: () => void;
};

export default function Dashboard({
  onGoToLeaderboard,
  onGoToWallet,
  onGoToClaim,
}: DashboardProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { data: session, status } = useSession();

  const upcomingFallback = getUpcomingFixtures();
  const [upcomingFixtures, setUpcomingFixtures] =
    useState<UpcomingMatch[]>(upcomingFallback);
  const [showAllToday, setShowAllToday] = useState(false);
  const [predFixture, setPredFixture] = useState<Fixture | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [claimableBnb, setClaimableBnb] = useState(0);
  const [hasClaimableRewards, setHasClaimableRewards] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchUpcomingMatches()
        .then((fixtures) => {
          if (!cancelled) setUpcomingFixtures(fixtures);
        })
        .catch(() => {
          if (!cancelled) setUpcomingFixtures(getUpcomingFixtures());
        });
    };
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    let cancelled = false;

    void fetchMyLeaderboardStats()
      .then((stats) => {
        if (cancelled) return;
        setMyRank(stats.rank);
        setMyPoints(stats.total_points);
      })
      .catch(() => {
        if (!cancelled) {
          setMyRank(null);
          setMyPoints(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, session?.user?.name, session?.user?.username]);

  useEffect(() => {
    if (status !== "authenticated") {
      setHasClaimableRewards(false);
      setClaimableBnb(0);
      return;
    }
    let cancelled = false;
    void fetchClaimableRewards()
      .then((rewards) => {
        if (cancelled) return;
        const pending = rewards.filter((r) => !r.claimed);
        setHasClaimableRewards(pending.length > 0);
        setClaimableBnb(pending.reduce((sum, r) => sum + r.bnb, 0));
      })
      .catch(() => {
        if (!cancelled) {
          setHasClaimableRewards(false);
          setClaimableBnb(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, session?.user?.username]);

  const nextSlotFixtures = useMemo(
    () => getNextKickoffSlotFixtures(upcomingFixtures),
    [upcomingFixtures],
  );
  const primaryDay = upcomingFixtures[0]?.date;
  const todayFixtures = useMemo(
    () =>
      primaryDay ? getUpcomingFixturesOnDate(upcomingFixtures, primaryDay) : [],
    [upcomingFixtures, primaryDay],
  );
  const canExpandToday = todayFixtures.length > nextSlotFixtures.length;
  const visibleFixtures = showAllToday ? todayFixtures : nextSlotFixtures;
  const primaryFixture = visibleFixtures[0];
  const otherFixtures = visibleFixtures.slice(1);
  const nextSlotKey = nextSlotFixtures[0]
    ? `${nextSlotFixtures[0].date}T${nextSlotFixtures[0].time}`
    : null;

  useEffect(() => {
    setShowAllToday(false);
  }, [nextSlotKey, primaryDay]);

  return (
    <div
      id="s-dash"
      className={`${styles.root} ${outfit.variable} ${dmMono.variable}`}
    >
      <AppShell
        activeTab="home"
        onHome={() => {}}
        onRanks={onGoToLeaderboard}
        onWallet={onGoToWallet}
        onClaim={onGoToClaim}
        claimHighlight={hasClaimableRewards}
      >
        <section className={styles.positionStrip}>
          <div className={styles.positionMain}>
            <span className={styles.positionLabel}>{t("yourRank")}</span>
            <span className={styles.positionRank}>
              {myRank != null ? `#${myRank}` : tc("emDash")}
            </span>
          </div>
          <div className={styles.positionDivider} />
          <div className={styles.positionSide}>
            <span className={styles.positionLabel}>{tc("pointsLabel")}</span>
            <span className={styles.positionPts}>
              {myPoints != null ? myPoints.toLocaleString() : tc("emDash")}
            </span>
          </div>
        </section>

        {hasClaimableRewards ? (
          <button
            type="button"
            className={styles.rewardPulse}
            onClick={onGoToClaim}
            aria-label={t("claimRewardsAria")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TROPHY_SRC} alt="" className={styles.rewardIcon} />
            <span>
              {t("rewardsReady", {
                amount: bnbStr(claimableBnb),
                usd: usd(claimableBnb),
              })}
            </span>
          </button>
        ) : null}

        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.blockTitle}>{t("fixturesSection")}</h2>
          </div>
          {upcomingFixtures.length === 0 ? (
            <MatchCardEmpty message={t("noUpcomingMatches")} />
          ) : (
            <>
              {primaryFixture ? (
                <div className={styles.featuredWrap}>
                  <MatchCard
                    key={primaryFixture.id}
                    fixture={primaryFixture}
                    variant="featured"
                    label={t("nextMatch")}
                    onPredict={() => setPredFixture(primaryFixture)}
                    predictLabel={t("predictOnX")}
                  />
                </div>
              ) : null}
              {otherFixtures.length > 0 ? (
                <div className={styles.compactList}>
                  {otherFixtures.map((fixture) => (
                    <MatchCard
                      key={fixture.id}
                      fixture={fixture}
                      variant="compact"
                      onPredict={() => setPredFixture(fixture)}
                      predictLabel={t("predictOnX")}
                    />
                  ))}
                </div>
              ) : null}
              {canExpandToday ? (
                <button
                  type="button"
                  className={styles.expandBtn}
                  onClick={() => setShowAllToday((v) => !v)}
                  aria-expanded={showAllToday}
                >
                  {showAllToday
                    ? t("showFewerFixtures")
                    : t("showAllFixtures", { count: todayFixtures.length })}
                </button>
              ) : null}
            </>
          )}
        </section>
      </AppShell>

      {predFixture ? (
        <PredictionModal
          open={Boolean(predFixture)}
          fixture={predFixture}
          onClose={() => setPredFixture(null)}
        />
      ) : null}
    </div>
  );
}
