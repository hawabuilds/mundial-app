"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatKickoffLocalLine,
  formatKickoffUtcLine,
  kickoffDate,
} from "@/lib/formatKickoff";

export function useLocalKickoff(
  date: string,
  time: string,
  kickoffUtcMs?: number | null,
): {
  line: string;
  ready: boolean;
} {
  const kickoff = useMemo(
    () => kickoffDate({ date, time, kickoffUtcMs }),
    [date, time, kickoffUtcMs],
  );
  const [mounted, setMounted] = useState(false);
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setMounted(true);
  }, []);

  const line = useMemo(() => {
    if (!mounted) return formatKickoffUtcLine(kickoff);
    return formatKickoffLocalLine(kickoff, "en", timeZone);
  }, [kickoff, mounted, timeZone]);

  return { line, ready: mounted };
}

export function formatExampleReply(home: string, away: string): string {
  return `${home} 2-1 ${away}`;
}
