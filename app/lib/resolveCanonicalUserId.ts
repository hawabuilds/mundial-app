import { getLeaderboard, getSupabaseAdminClient } from "@/app/lib/supabase";
import {
  getTwitterHandleFromSession,
  getTwitterUserIdFromSession,
  isTwitterNumericUserId,
  normalizeTwitterHandle,
} from "@/lib/twitterUserId";

type SessionLike = {
  user?: {
    id?: string | number;
    name?: string | null;
    username?: string | null;
  } | null;
} | null;

async function lookupUserIdByHandleInTable(
  table: "predictions" | "leaderboard_snapshots",
  handle: string,
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const normalized = normalizeTwitterHandle(handle);
  if (!normalized) return null;

  const patterns = [`@${normalized}`, normalized];

  for (const pattern of patterns) {
    const { data, error } = await supabase
      .from(table)
      .select("user_id, user_handle")
      .ilike("user_handle", pattern)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data && isTwitterNumericUserId(data.user_id)) {
      return data.user_id.trim();
    }
  }

  return null;
}

async function lookupUserIdOnLiveLeaderboard(handle: string): Promise<string | null> {
  const normalized = normalizeTwitterHandle(handle);
  if (!normalized) return null;

  const board = await getLeaderboard(100);
  const match = board.find(
    (entry) => normalizeTwitterHandle(entry.user_handle) === normalized,
  );

  if (match && isTwitterNumericUserId(match.user_id)) {
    return match.user_id.trim();
  }

  return null;
}

/**
 * Canonical X numeric user id for DB keys.
 * Wallet linking does not require an existing prediction or leaderboard row.
 */
export async function resolveWalletUserId(
  session: SessionLike,
): Promise<string | null> {
  const fromSession = getTwitterUserIdFromSession(session);
  if (fromSession) return fromSession;

  return resolveCanonicalUserId(session);
}

/**
 * Canonical X numeric user id for DB keys.
 * 1. Numeric id on session (string-safe)
 * 2. Lookup from predictions by @handle (stale JWT / wrong OAuth sub)
 * 3. Lookup from leaderboard_snapshots by @handle (winners without a prediction row match)
 */
export async function resolveCanonicalUserId(
  session: SessionLike,
): Promise<string | null> {
  const fromSession = getTwitterUserIdFromSession(session);
  if (fromSession) return fromSession;

  const handle = getTwitterHandleFromSession(session);
  if (!handle) return null;

  const fromPredictions = await lookupUserIdByHandleInTable("predictions", handle);
  if (fromPredictions) return fromPredictions;

  const fromSnapshots = await lookupUserIdByHandleInTable(
    "leaderboard_snapshots",
    handle,
  );
  if (fromSnapshots) return fromSnapshots;

  return lookupUserIdOnLiveLeaderboard(handle);
}

/** Safe detail for API errors — never includes secrets. */
export function describeSessionIdentity(session: SessionLike): {
  numericId: string | null;
  handle: string | null;
} {
  return {
    numericId: getTwitterUserIdFromSession(session),
    handle: getTwitterHandleFromSession(session),
  };
}
