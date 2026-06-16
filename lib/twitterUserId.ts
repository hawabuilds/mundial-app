/** X/Twitter numeric snowflake user id (OAuth user id, reply author_id). */
export function isTwitterNumericUserId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{1,20}$/.test(value.trim());
}

export function normalizeTwitterHandle(
  handle: string | null | undefined,
): string | null {
  if (!handle?.trim()) return null;
  return handle.replace(/^@/, "").trim().toLowerCase() || null;
}

type SessionLike = {
  user?: {
    id?: string | number;
    name?: string | null;
    username?: string | null;
  } | null;
} | null;

/**
 * Canonical X user id for DB keys — numeric author_id only.
 * Returns null if the session carries a non-numeric id (stale/wrong OAuth sub).
 */
export function getTwitterUserIdFromSession(
  session: SessionLike,
): string | null {
  const raw = session?.user?.id;
  if (raw == null) return null;

  const id = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (isTwitterNumericUserId(id)) return id;
  return null;
}

export function getTwitterHandleFromSession(
  session: SessionLike,
): string | null {
  const fromUsername = normalizeTwitterHandle(session?.user?.username);
  if (fromUsername) return fromUsername;

  const name = session?.user?.name?.trim() ?? "";
  if (name.startsWith("@")) {
    return normalizeTwitterHandle(name);
  }

  return null;
}

/** Pick the best numeric Twitter id from JWT fields. */
export function pickTwitterUserIdFromToken(fields: {
  twitterId?: string | null;
  sub?: string | null;
}): string | null {
  if (isTwitterNumericUserId(fields.twitterId)) {
    return fields.twitterId!.trim();
  }
  if (isTwitterNumericUserId(fields.sub)) {
    return fields.sub!.trim();
  }
  return null;
}
