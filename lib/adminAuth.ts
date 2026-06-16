import {
  getTwitterHandleFromSession,
  getTwitterUserIdFromSession,
  normalizeTwitterHandle,
} from "@/lib/twitterUserId";

type SessionLike = Parameters<typeof getTwitterHandleFromSession>[0];

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Project admins for bounty management.
 * Set BOUNTY_ADMIN_HANDLES (comma-separated X handles, no @) and/or
 * BOUNTY_ADMIN_USER_IDS (comma-separated numeric X user ids) on the server.
 */
export function isAdminSession(session: SessionLike): boolean {
  const allowedHandles = parseList(process.env.BOUNTY_ADMIN_HANDLES).map(
    (handle) => normalizeTwitterHandle(handle),
  );
  const allowedIds = parseList(process.env.BOUNTY_ADMIN_USER_IDS);

  const handle = getTwitterHandleFromSession(session);
  if (handle && allowedHandles.includes(handle)) return true;

  const userId = getTwitterUserIdFromSession(session);
  if (userId && allowedIds.includes(userId)) return true;

  return false;
}
