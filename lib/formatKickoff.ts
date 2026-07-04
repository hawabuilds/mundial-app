export type KickoffFixture = {
  date: string;
  time: string;
  /** Epoch ms from TxLINE StartTime — preferred over date/time strings. */
  kickoffUtcMs?: number | null;
};

/** TxLINE StartTime may be Unix seconds or milliseconds. */
export function normalizeStartTimeMs(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 1_000_000_000_000 ? raw * 1000 : raw;
}

/** Parse stored UTC kickoff (YYYY-MM-DD + HH:mm), or epoch ms when provided. */
export function kickoffDate(fixture: KickoffFixture): Date {
  const ms = normalizeStartTimeMs(fixture.kickoffUtcMs ?? 0);
  if (ms > 0) return new Date(ms);
  return new Date(`${fixture.date}T${fixture.time}:00Z`);
}

export function resolveIntlLocale(): string {
  return "en-GB";
}

/** Locale for local clock time. */
export function resolveIntlTimeLocale(): string {
  return "en-US";
}

/**
 * Pick an Intl locale whose `timeZoneName: "short"` yields regional abbreviations
 * (PDT, BST, JST, …) instead of GMT offsets for the given IANA zone.
 */
export function resolveZoneLabelLocale(timeZone: string): string {
  if (timeZone.startsWith("America/")) return "en-US";
  if (timeZone.startsWith("Europe/")) return "en-GB";
  if (timeZone.startsWith("Australia/")) return "en-AU";
  if (timeZone === "Asia/Tokyo") return "ja-JP";
  if (timeZone === "Asia/Kolkata") return "en-IN";
  if (timeZone.startsWith("Pacific/")) {
    if (
      timeZone === "Pacific/Honolulu" ||
      timeZone === "Pacific/Guam" ||
      timeZone === "Pacific/Pago_Pago" ||
      timeZone === "Pacific/Midway"
    ) {
      return "en-US";
    }
    return "en-AU";
  }
  if (timeZone.startsWith("Asia/")) return "en-US";
  if (timeZone.startsWith("Atlantic/")) return "en-GB";
  if (timeZone.startsWith("Africa/")) return "en-GB";
  return "en-US";
}

function isOffsetStyleZoneName(zoneName: string): boolean {
  const trimmed = zoneName.trim();
  if (!trimmed) return true;
  return /^(?:GMT|UTC)[+-]\d/i.test(trimmed);
}

function resolveTimeZoneName(kickoff: Date, timeZone: string): string | null {
  const zoneLabelLocale = resolveZoneLabelLocale(timeZone);

  for (const timeZoneName of ["short", "shortGeneric"] as const) {
    try {
      const zonePart = new Intl.DateTimeFormat(zoneLabelLocale, {
        timeZone,
        timeZoneName,
        hour: "numeric",
        minute: "2-digit",
      })
        .formatToParts(kickoff)
        .find((part) => part.type === "timeZoneName");
      const name = zonePart?.value.trim();
      if (name && !isOffsetStyleZoneName(name)) return name;
    } catch {
      // shortGeneric unsupported — try next option.
    }
  }

  return null;
}

function formatLocalTimeWithZone(kickoff: Date, timeZone: string): string {
  const timeLocale = resolveIntlTimeLocale();
  const time = new Intl.DateTimeFormat(timeLocale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(kickoff);
  const zoneName = resolveTimeZoneName(kickoff, timeZone);

  if (!zoneName) return time;
  return `${time} ${zoneName}`;
}

export function formatKickoffUtcLabel(time: string): string {
  return `${time} UTC`;
}

/** Stable UTC kickoff line for SSR / pre-timezone hydration. */
export function formatKickoffUtcLine(kickoff: Date): string {
  const intlLocale = resolveIntlLocale();
  const datePart = new Intl.DateTimeFormat(intlLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(kickoff);
  const timePart = formatKickoffUtcLabel(
    kickoff.toISOString().slice(11, 16),
  );
  return `${datePart} · ${timePart}`;
}

export function formatKickoffLocalLine(
  kickoff: Date,
  _appLocale: string,
  timeZone: string,
): string {
  const intlLocale = resolveIntlLocale();
  const datePart = new Intl.DateTimeFormat(intlLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(kickoff);
  const timePart = formatLocalTimeWithZone(kickoff, timeZone);
  return `${datePart} · ${timePart}`;
}

export function formatKickoffLocalDateShort(
  kickoff: Date,
  _appLocale: string,
  timeZone: string,
): string {
  const intlLocale = resolveIntlLocale();
  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(kickoff);
}

function localDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isKickoffLocalToday(
  kickoff: Date,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return localDayKey(kickoff, timeZone) === localDayKey(now, timeZone);
}

export function formatNextMatchBadgeLocal(
  kickoff: Date,
  appLocale: string,
  timeZone: string,
  todayLabel: string,
  now: Date = new Date(),
): string {
  if (isKickoffLocalToday(kickoff, timeZone, now)) return todayLabel;
  return formatKickoffLocalDateShort(kickoff, appLocale, timeZone);
}
