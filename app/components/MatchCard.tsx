"use client";

import type { Fixture } from "../data/fixtures";
import { TeamFlag } from "./MatchFlags";
import {
  FixtureKickoffBadge,
  FixtureKickoffGroupLine,
  FixtureKickoffTime,
} from "./FixtureKickoffDisplay";
import styles from "./MatchCard.module.css";

type MatchCardFixture = Fixture & {
  statusLabel?: string | null;
};

type MatchCardProps = {
  fixture: MatchCardFixture;
  variant?: "featured" | "compact" | "spotlight" | "timeline";
  label?: string;
  onPredict?: () => void;
  predictLabel?: string;
  vsLabel?: string;
  emptyMessage?: string;
};

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={styles.predictIcon}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622z" />
    </svg>
  );
}

export default function MatchCard({
  fixture,
  variant = "featured",
  label,
  onPredict,
  predictLabel,
  vsLabel = "vs",
}: MatchCardProps) {
  if (variant === "timeline") {
    return (
      <div className={styles.timeline}>
        <div className={styles.timelineTrack}>
          <span className={styles.timelineDot} />
        </div>
        <div className={styles.timelineBody}>
          <div className={styles.timelineTeams}>
            <TeamFlag team={fixture.home} className={styles.timelineFlag} width={20} height={14} />
            <span className={styles.timelineNames}>
              {fixture.home} · {fixture.away}
            </span>
            <TeamFlag team={fixture.away} className={styles.timelineFlag} width={20} height={14} />
          </div>
          <div className={styles.timelineMeta}>
            <FixtureKickoffGroupLine fixture={fixture} />
          </div>
          {onPredict && predictLabel ? (
            <button type="button" className={styles.timelineAction} onClick={onPredict}>
              {predictLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`${styles.compact} ${label ? styles.compactFeatured : ""}`}>
        <div className={styles.compactFlags}>
          <TeamFlag
            team={fixture.home}
            className={styles.compactFlag}
            width={22}
            height={15}
          />
          <TeamFlag
            team={fixture.away}
            className={styles.compactFlag}
            width={22}
            height={15}
          />
        </div>
        <div className={styles.compactMeta}>
          <div className={styles.compactTeams}>
            {fixture.home} {vsLabel} {fixture.away}
          </div>
          <div className={styles.compactTime}>
            <FixtureKickoffGroupLine fixture={fixture} />
          </div>
        </div>
        {onPredict ? (
          <button
            type="button"
            className={styles.compactPredict}
            onClick={onPredict}
            aria-label={predictLabel}
          >
            <XIcon />
          </button>
        ) : null}
      </div>
    );
  }

  const isFeatured = variant === "featured";
  const cardClass = [
    styles.card,
    isFeatured ? styles.cardFeatured : "",
    onPredict ? styles.cardInteractive : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClass}>
      {label || fixture.statusLabel ? (
        <div className={styles.head}>
          {label ? <span className={styles.label}>{label}</span> : <span />}
          {fixture.statusLabel != null ? (
            <div className={styles.status}>
              <span className={styles.statusDot} />
              <FixtureKickoffBadge
                fixture={fixture}
                statusLabel={fixture.statusLabel}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`${styles.arena} ${isFeatured ? styles.arenaFeatured : ""}`}>
        <div className={styles.side}>
          <TeamFlag
            team={fixture.home}
            className={`${styles.flag} ${isFeatured ? styles.flagFeatured : styles.flagDefault}`}
            width={isFeatured ? 52 : 36}
            height={isFeatured ? 34 : 24}
          />
          <span className={`${styles.team} ${isFeatured ? styles.teamFeatured : ""}`}>
            {fixture.home}
          </span>
        </div>

        <div className={styles.divider}>
          <span className={styles.vs}>{vsLabel}</span>
        </div>

        <div className={styles.side}>
          <TeamFlag
            team={fixture.away}
            className={`${styles.flag} ${isFeatured ? styles.flagFeatured : styles.flagDefault}`}
            width={isFeatured ? 52 : 36}
            height={isFeatured ? 34 : 24}
          />
          <span className={`${styles.team} ${isFeatured ? styles.teamFeatured : ""}`}>
            {fixture.away}
          </span>
        </div>
      </div>

      <div className={styles.foot}>
        <div className={styles.time}>
          {variant === "spotlight" ? (
            <FixtureKickoffTime fixture={fixture} />
          ) : (
            <FixtureKickoffGroupLine fixture={fixture} />
          )}
        </div>
        {onPredict && predictLabel ? (
          <button type="button" className={styles.predict} onClick={onPredict}>
            {predictLabel}
            <XIcon />
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function MatchCardEmpty({ message }: { message: string }) {
  return <div className={styles.empty}>{message}</div>;
}
