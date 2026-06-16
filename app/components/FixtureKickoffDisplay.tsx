"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  formatFixtureDateShort,
  formatFixtureLabel,
  type Fixture,
} from "../data/fixtures";
import {
  formatKickoffLocalLine,
  formatNextMatchBadgeLocal,
  kickoffDate,
} from "@/lib/formatKickoff";
import styles from "./FixtureKickoffDisplay.module.css";

function useVisitorTimeZone(): { mounted: boolean; timeZone: string } {
  const [mounted, setMounted] = useState(false);
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setMounted(true);
  }, []);

  return { mounted, timeZone };
}

function useKickoffLocalLine(fixture: Pick<Fixture, "date" | "time">) {
  const locale = useLocale();
  const { mounted, timeZone } = useVisitorTimeZone();
  const kickoff = useMemo(() => kickoffDate(fixture), [fixture.date, fixture.time]);
  const localLine = mounted
    ? formatKickoffLocalLine(kickoff, locale, timeZone)
    : null;
  const placeholder = formatFixtureDateShort(fixture.date);

  return { localLine, placeholder };
}

type FixtureKickoffTimeProps = {
  fixture: Pick<Fixture, "date" | "time">;
  className?: string;
};

export function FixtureKickoffTime({ fixture, className }: FixtureKickoffTimeProps) {
  const { localLine, placeholder } = useKickoffLocalLine(fixture);

  return (
    <span className={className}>{localLine ?? placeholder}</span>
  );
}

export function FixtureKickoffGroupLine({ fixture }: { fixture: Fixture }) {
  const { localLine, placeholder } = useKickoffLocalLine(fixture);

  return (
    <div className={styles.groupLine}>
      <span>{localLine ?? placeholder}</span>
      <span className={styles.groupMeta}>· {fixture.group}</span>
    </div>
  );
}

type FixtureKickoffBadgeProps = {
  fixture: Pick<Fixture, "date" | "time">;
  statusLabel?: string | null;
};

export function FixtureKickoffBadge({
  fixture,
  statusLabel,
}: FixtureKickoffBadgeProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { mounted, timeZone } = useVisitorTimeZone();
  const kickoff = useMemo(() => kickoffDate(fixture), [fixture.date, fixture.time]);

  if (statusLabel) return <>{statusLabel}</>;

  if (!mounted) {
    return <>{formatFixtureDateShort(fixture.date)}</>;
  }

  return (
    <>
      {formatNextMatchBadgeLocal(kickoff, locale, timeZone, t("kickoffToday"))}
    </>
  );
}

export function FixtureKickoffModalSub({ fixture }: { fixture: Fixture }) {
  const { localLine, placeholder } = useKickoffLocalLine(fixture);
  const teams = formatFixtureLabel(fixture);

  return (
    <>
      {teams} · {localLine ?? placeholder}
    </>
  );
}
