"use client";

import { useTranslations } from "next-intl";
import { DM_Mono, Outfit } from "next/font/google";
import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  avatarInitials,
  tierForRank,
  type LeaderboardTier,
} from "../data/leaderboard";
import { sessionUserIdentity } from "../lib/auth-client";
import { tierNameKey, tierRangeKey } from "../lib/i18n-tiers";
import {
  fetchLeaderboard,
  handleToInitials,
  handleToUsername,
  playerMatchesSession,
  type ApiLeaderboardPlayer,
} from "../lib/leaderboard-client";
import AppShell from "./AppShell";
import { RankCard, RankCardList } from "./RankCard";
import styles from "./Leaderboard.module.css";

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

type LeaderboardProps = {
  onGoToDashboard: () => void;
  onGoToWallet: () => void;
  onGoToClaim: () => void;
};

function TierHeader({ tier }: { tier: LeaderboardTier }) {
  const t = useTranslations("tiers");
  const pillClass =
    tier.pillClass === "tier1"
      ? styles.tier1
      : tier.pillClass === "tier2"
        ? styles.tier2
        : styles.tier3;

  return (
    <div className={styles.tierHead}>
      <span className={`${styles.tierPill} ${pillClass}`}>
        {t(tierNameKey(tier.pillClass))}
      </span>
      <span className={styles.tierMeta}>{t(tierRangeKey(tier.pillClass))}</span>
    </div>
  );
}

export default function Leaderboard({
  onGoToDashboard,
  onGoToWallet,
  onGoToClaim,
}: LeaderboardProps) {
  const t = useTranslations("leaderboard");
  const tc = useTranslations("common");
  const { data: session, status } = useSession();
  const user = sessionUserIdentity(
    status,
    session?.user?.name,
    session?.user?.image,
    session?.user?.username,
  );
  const [players, setPlayers] = useState<ApiLeaderboardPlayer[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchLeaderboard()
        .then((data) => {
          if (cancelled) return;
          setPlayers(data.players);
          setTotalPlayers(data.totalPlayers);
          setError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setError(t("loadFailed"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [t]);

  let lastTier: LeaderboardTier | null = null;

  return (
    <div
      id="s-lb"
      className={`${styles.root} ${outfit.variable} ${dmMono.variable}`}
    >
      <AppShell
        activeTab="ranks"
        onHome={onGoToDashboard}
        onRanks={() => {}}
        onWallet={onGoToWallet}
        onClaim={onGoToClaim}
      >
        <header className={styles.intro}>
          <p className={styles.sub}>
            {loading
              ? t("loadingRankings")
              : tc("playersCount", {
                  count: totalPlayers.toLocaleString(),
                })}
          </p>
          {!loading && !error ? (
            <p className={styles.hint}>{t("subtitle")}</p>
          ) : null}
        </header>

        {error ? (
          <p className={styles.empty}>{error}</p>
        ) : loading ? (
          <p className={styles.empty}>{tc("loadingEllipsis")}</p>
        ) : players.length === 0 ? (
          <p className={styles.empty}>{t("emptyState")}</p>
        ) : (
          <RankCardList>
            {players.map((player) => {
              const tier = tierForRank(player.rank);
              const showHeader = tier && tier !== lastTier;
              const isMe = playerMatchesSession(player, session);
              const username = handleToUsername(player.user_handle);

              if (tier) lastTier = tier;

              return (
                <Fragment key={player.user_id}>
                  {showHeader && tier ? <TierHeader tier={tier} /> : null}
                  <RankCard
                    rank={player.rank}
                    handle={`${player.user_handle}${isMe ? tc("youSuffix") : ""}`}
                    points={player.total_points}
                    isMe={isMe}
                    imageSrc={isMe ? user.image : undefined}
                    initials={
                      isMe
                        ? handleToInitials(player.user_handle)
                        : avatarInitials(username)
                    }
                    username={username}
                  />
                </Fragment>
              );
            })}
          </RankCardList>
        )}
      </AppShell>
    </div>
  );
}
