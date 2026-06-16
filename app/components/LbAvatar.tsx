"use client";

import { useState } from "react";
import styles from "./LbAvatar.module.css";

type LbAvatarProps = {
  username: string;
  initials: string;
  me?: boolean;
  imageSrc?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = {
  sm: styles.lbAvSm,
  md: styles.lbAvMd,
  lg: styles.lbAvLg,
} as const;

export default function LbAvatar({
  username,
  initials,
  me,
  imageSrc,
  size = "sm",
}: LbAvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASS[size];
  const avClass = me
    ? `${styles.lbAv} ${sizeClass} ${styles.lbAvMe}`
    : `${styles.lbAv} ${sizeClass}`;
  const fallbackClass = me
    ? `${styles.lbAv} ${sizeClass} ${styles.lbAvMe} ${styles.lbAvMeFallback}`
    : `${styles.lbAv} ${sizeClass} ${styles.lbAvFallback}`;

  if (failed) {
    return <div className={fallbackClass}>{initials}</div>;
  }

  return (
    <div className={avClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc ?? `https://unavatar.io/twitter/${username}`}
        alt={initials}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
