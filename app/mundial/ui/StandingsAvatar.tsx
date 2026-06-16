"use client";

import { useState } from "react";
import { handleToInitials, handleToUsername } from "@/app/lib/leaderboard-client";
import styles from "./StandingsAvatar.module.css";

type StandingsAvatarProps = {
  handle: string;
  isMe?: boolean;
  imageSrc?: string;
};

export default function StandingsAvatar({
  handle,
  isMe = false,
  imageSrc,
}: StandingsAvatarProps) {
  const [failed, setFailed] = useState(false);
  const username = handleToUsername(handle);
  const initials = handleToInitials(handle);
  const cls = [
    styles.avatar,
    isMe ? styles.avatarMe : "",
    failed ? styles.avatarFallback : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (failed) {
    return <span className={cls}>{initials}</span>;
  }

  const src =
    imageSrc ?? `/api/avatar?username=${encodeURIComponent(username)}`;

  return (
    <span className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    </span>
  );
}
