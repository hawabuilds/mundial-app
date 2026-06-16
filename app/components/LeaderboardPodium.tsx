"use client";

import LbAvatar from "./LbAvatar";
import styles from "./LeaderboardPodium.module.css";

export type PodiumPlayer = {
  rank: number;
  handle: string;
  points: number;
  isMe?: boolean;
  imageSrc?: string;
  initials: string;
  username: string;
};

type LeaderboardPodiumProps = {
  players: PodiumPlayer[];
};

function PodiumSlot({
  player,
  size,
}: {
  player: PodiumPlayer;
  size: "gold" | "silver" | "bronze";
}) {
  const rankClass =
    size === "gold"
      ? styles.rankBadgeGold
      : size === "silver"
        ? styles.rankBadgeSilver
        : styles.rankBadgeBronze;
  const wrapClass =
    size === "gold"
      ? styles.avatarWrapGold
      : size === "silver"
        ? styles.avatarWrapSilver
        : styles.avatarWrapBronze;
  const pedestalClass =
    size === "gold"
      ? styles.pedestalGold
      : size === "silver"
        ? styles.pedestalSilver
        : styles.pedestalBronze;
  const slotClass = size === "gold" ? styles.slotFirst : "";

  return (
    <div className={`${styles.slot} ${slotClass}`}>
      <span className={`${styles.rankBadge} ${rankClass}`}>#{player.rank}</span>
      <div className={`${styles.avatarWrap} ${wrapClass}`}>
        <LbAvatar
            username={player.username}
            initials={player.initials}
            imageSrc={player.imageSrc}
            me={player.isMe}
            size={size === "gold" ? "lg" : "md"}
          />
      </div>
      <span
        className={`${styles.handle} ${player.isMe ? styles.handleMe : ""}`}
        title={player.handle}
      >
        {player.handle}
      </span>
      <span className={`${styles.points} ${player.isMe ? styles.pointsMe : ""}`}>
        {player.points.toLocaleString()} pts
      </span>
      <div className={`${styles.pedestal} ${pedestalClass}`} />
    </div>
  );
}

export default function LeaderboardPodium({ players }: LeaderboardPodiumProps) {
  if (players.length < 3) return null;

  const byRank = [...players].sort((a, b) => a.rank - b.rank);
  const first = byRank.find((p) => p.rank === 1);
  const second = byRank.find((p) => p.rank === 2);
  const third = byRank.find((p) => p.rank === 3);

  if (!first || !second || !third) return null;

  return (
    <div className={styles.podium} aria-label="Top 3">
      <PodiumSlot player={second} size="silver" />
      <PodiumSlot player={first} size="gold" />
      <PodiumSlot player={third} size="bronze" />
    </div>
  );
}
