"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  tierForRank,
  type LeaderboardTier,
} from "@/app/data/leaderboard";
import {
  fetchLeaderboard,
  playerMatchesSession,
  type ApiLeaderboardPlayer,
} from "@/app/lib/leaderboard-client";
import Card from "../ui/Card";
import StandingsAvatar from "../ui/StandingsAvatar";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import styles from "./Standings.module.css";

type Props = {
  onTabChange: (t: TabId) => void;
  vaultDot?: boolean;
};

function TierHeader({ tier }: { tier: LeaderboardTier }) {
  const pillClass =
    tier.pillClass === "tier1"
      ? styles.tier1
      : tier.pillClass === "tier2"
        ? styles.tier2
        : styles.tier3;

  return (
    <li className={styles.tierHead} aria-hidden>
      <span className={`${styles.tierPill} ${pillClass}`}>{tier.name}</span>
    </li>
  );
}

export default function Standings({ onTabChange, vaultDot }: Props) {
  const { data: session } = useSession();
  const [players, setPlayers] = useState<ApiLeaderboardPlayer[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchLeaderboard(20)
        .then((data) => {
          if (cancelled) return;
          setPlayers(data.players);
          setTotalPlayers(data.totalPlayers);
          setError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setError("Could not load standings");
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
  }, []);

  let lastTier: LeaderboardTier | null = null;

  return (
    <AppShell tab="standings" onTabChange={onTabChange} vaultDot={vaultDot}>
      <div className={styles.intro}>
        <h2 className="m-headline">Leaderboard</h2>
        <p className="m-body">
          {loading
            ? "Loading rankings…"
            : `${totalPlayers.toLocaleString()} players · snapshot 10:00 UTC`}
        </p>
        {!loading && !error ? (
          <p className={styles.tierHint}>
            Top 20 earn daily USDC rewards across three tiers
          </p>
        ) : null}
      </div>

      {error ? (
        <p className={styles.empty}>{error}</p>
      ) : loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : players.length === 0 ? (
        <p className={styles.empty}>No rankings yet — be the first to predict.</p>
      ) : (
        <ol className={styles.list}>
          {players.map((player) => {
            const tier = tierForRank(player.rank);
            const showHeader = tier && tier !== lastTier;
            const isMe = playerMatchesSession(player, session);

            if (tier) lastTier = tier;

            return (
              <Fragment key={player.user_id}>
                {showHeader && tier ? <TierHeader tier={tier} /> : null}
                <li>
                  <Card
                    glow={isMe}
                    className={`${styles.row}${isMe ? ` ${styles.rowYou}` : ""}${
                      tier?.rowClass === "t1"
                        ? ` ${styles.rowT1}`
                        : tier?.rowClass === "t2"
                          ? ` ${styles.rowT2}`
                          : tier?.dimReward
                            ? ` ${styles.rowT3}`
                            : ""
                    }`}
                  >
                    <span className={styles.place}>{player.rank}</span>
                    <StandingsAvatar
                      handle={player.user_handle}
                      isMe={isMe}
                      imageSrc={isMe ? session?.user?.image ?? undefined : undefined}
                    />
                    <span className={styles.handle}>
                      {player.user_handle}
                      {isMe ? " · you" : ""}
                    </span>
                    <span className={styles.pts}>
                      {player.total_points.toLocaleString()}
                    </span>
                  </Card>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}

    </AppShell>
  );
}
