"use client";

import type { ReactNode } from "react";
import LbAvatar from "./LbAvatar";
import styles from "./RankCard.module.css";

type RankCardProps = {
  rank: number;
  handle: string;
  points: number;
  isMe?: boolean;
  imageSrc?: string;
  initials: string;
  username: string;
  compact?: boolean;
};

export function RankCard({
  rank,
  handle,
  points,
  isMe,
  imageSrc,
  initials,
  username,
  compact,
}: RankCardProps) {
  return (
    <article
      className={[
        styles.card,
        compact ? styles.cardCompact : "",
        isMe ? styles.cardMe : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[styles.rank, rank <= 3 ? styles.rankTop : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {rank}
      </span>
      {!compact ? (
        <LbAvatar
          username={username}
          initials={initials}
          imageSrc={imageSrc}
          me={isMe}
        />
      ) : null}
      <div className={styles.body}>
        <div
          className={[styles.handle, isMe ? styles.handleMe : ""]
            .filter(Boolean)
            .join(" ")}
          title={handle}
        >
          {handle}
        </div>
        <div className={styles.points}>{points.toLocaleString()} pts</div>
      </div>
    </article>
  );
}

export function RankCardScroll({ children }: { children: ReactNode }) {
  return <div className={styles.scroll}>{children}</div>;
}

export function RankCardList({ children }: { children: ReactNode }) {
  return <div className={styles.list}>{children}</div>;
}
