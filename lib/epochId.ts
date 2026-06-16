/** UTC calendar day as uint256-style id, e.g. 20260528. */
export function epochIdForDate(date: Date = new Date()): bigint {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return BigInt(`${y}${m}${d}`);
}

/**
 * Optional launch gate: set FIRST_SNAPSHOT_EPOCH_ID=YYYYMMDD (UTC) on the server.
 * Snapshot cron skips all days before this epoch id.
 */
export function getFirstSnapshotEpochId(): bigint | null {
  const raw = process.env.FIRST_SNAPSHOT_EPOCH_ID?.trim();
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  try {
    const value = BigInt(raw);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

export function isBeforeFirstSnapshotEpoch(epochId: bigint): boolean {
  const first = getFirstSnapshotEpochId();
  return first !== null && epochId < first;
}

export function parseEpochId(raw: unknown): bigint | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return BigInt(raw);
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    try {
      const value = BigInt(raw.trim());
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

const WEEKDAY_KEYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

function isCalendarEpochId(epochId: bigint): boolean {
  const s = String(epochId);
  if (!/^\d{8}$/.test(s)) return false;
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Human labels for an epoch (calendar YYYYMMDD or finalized snapshot day). */
export function formatEpochDayLabels(
  epochId: bigint,
  referenceDate?: Date | string | null,
): {
  day: string;
  date: string;
} {
  if (!isCalendarEpochId(epochId)) {
    const ref =
      referenceDate instanceof Date
        ? referenceDate
        : referenceDate
          ? new Date(referenceDate)
          : new Date();
    const y = ref.getUTCFullYear();
    const mo = ref.getUTCMonth();
    const d = ref.getUTCDate();
    const epochDate = new Date(Date.UTC(y, mo, d));

    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const epochUtc = Date.UTC(y, mo, d);
    const diffDays = Math.round((todayUtc - epochUtc) / 86_400_000);

    let day: string;
    if (diffDays === 0) day = "Today";
    else if (diffDays === 1) day = "Yesterday";
    else day = WEEKDAY_KEYS[epochDate.getUTCDay()] ?? "Sun";

    const date = epochDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

    return { day, date };
  }

  const s = String(epochId).padStart(8, "0");
  const y = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  const epochDate = new Date(Date.UTC(y, mo, d));

  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const epochUtc = Date.UTC(y, mo, d);
  const diffDays = Math.round((todayUtc - epochUtc) / 86_400_000);

  let day: string;
  if (diffDays === 0) day = "Today";
  else if (diffDays === 1) day = "Yesterday";
  else day = WEEKDAY_KEYS[epochDate.getUTCDay()] ?? "Sun";

  const date = epochDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return { day, date };
}
