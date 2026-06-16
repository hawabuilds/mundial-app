"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatKickoffLocalLine,
  kickoffDate,
} from "@/lib/formatKickoff";

export function useVisitorTimeZone(): string {
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return timeZone;
}

export function useLocalKickoff(date: string, time: string): {
  line: string | null;
  ready: boolean;
} {
  const timeZone = useVisitorTimeZone();
  const kickoff = useMemo(() => kickoffDate({ date, time }), [date, time]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const line = ready ? formatKickoffLocalLine(kickoff, "en", timeZone) : null;

  return { line, ready };
}

export function formatExampleReply(home: string, away: string): string {
  return `${home} 2-1 ${away}`;
}
