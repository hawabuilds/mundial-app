import type { LeaderboardSnapshotRow } from "@/app/lib/leaderboardSnapshots";
import {
  getSnapshotEntry,
  getSnapshotEntryByHandle,
} from "@/app/lib/leaderboardSnapshots";
import { resolveCanonicalUserId } from "@/app/lib/resolveCanonicalUserId";
import { getTwitterHandleFromSession } from "@/lib/twitterUserId";

type SessionLike = {
  user?: {
    id?: string | number;
    name?: string | null;
    username?: string | null;
  } | null;
} | null;

/**
 * Find epoch snapshot row for the signed-in user.
 * Primary: numeric session id. Fallback: @handle (when session id is a wrong OAuth sub).
 * Always returns the canonical user_id stored in the snapshot row.
 */
export async function resolveSnapshotWinner(
  epochId: bigint,
  session: SessionLike,
): Promise<LeaderboardSnapshotRow | null> {
  const canonicalId = await resolveCanonicalUserId(session);
  if (canonicalId) {
    const byId = await getSnapshotEntry(epochId, canonicalId);
    if (byId) return byId;
  }

  const handle = getTwitterHandleFromSession(session);
  if (handle) {
    return getSnapshotEntryByHandle(epochId, handle);
  }

  return null;
}
