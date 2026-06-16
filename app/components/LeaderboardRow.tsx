"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import LbAvatar from "./LbAvatar";
import styles from "./LeaderboardRow.module.css";

type LeaderboardRowProps = {
  rank: number;
  handle: string;
  points: number;
  isMe?: boolean;
  imageSrc?: string;
  initials: string;
  username: string;
  topTier?: boolean;
};

export function LeaderboardRow({
  rank,
  handle,
  points,
  isMe,
  imageSrc,
  initials,
  username,
  topTier,
}: LeaderboardRowProps) {
  const isTop = topTier ?? rank <= 3;

  return (
    <div
      className={[
        styles.row,
        isTop ? styles.rowTop : "",
        isMe ? styles.rowMe : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          styles.rank,
          isTop ? styles.rankTop : "",
          isMe ? styles.rankMe : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {rank}
      </span>
      <LbAvatar
        username={username}
        initials={initials}
        imageSrc={imageSrc}
        me={isMe}
      />
      <span
        className={[styles.handle, isMe ? styles.handleMe : ""].filter(Boolean).join(" ")}
        title={handle}
      >
        {handle}
      </span>
      <span
        className={[styles.points, isMe ? styles.pointsMe : ""].filter(Boolean).join(" ")}
      >
        {points.toLocaleString()}
      </span>
    </div>
  );
}

export function LeaderboardTableHead() {
  const tc = useTranslations("common");
  const t = useTranslations("leaderboard");

  return (
    <div className={styles.tableHead}>
      <span>#</span>
      <span aria-hidden />
      <span>{t("columnPlayer")}</span>
      <span>{tc("pointsShort")}</span>
    </div>
  );
}

export function LeaderboardList({
  children,
  showHead = true,
}: {
  children: ReactNode;
  showHead?: boolean;
}) {
  return (
    <div className={styles.list}>
      {showHead ? <LeaderboardTableHead /> : null}
      <div className={styles.listInner}>{children}</div>
    </div>
  );
}

export function LeaderboardEmpty({ message }: { message: string }) {
  return <div className={styles.empty}>{message}</div>;
}
