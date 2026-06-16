import {
  normalizeTwitterHandle as normalizeHandle,
  getTwitterUserIdFromSession,
  getTwitterHandleFromSession,
} from "@/lib/twitterUserId";

export type ApiLeaderboardPlayer = {
  rank: number;
  user_id: string;
  user_handle: string;
  total_points: number;
};

export type ApiLeaderboardResponse = {
  players: ApiLeaderboardPlayer[];
  totalPlayers: number;
};

export function normalizeTwitterHandle(handle: string): string {
  return normalizeHandle(handle) ?? handle.replace(/^@/, "").trim().toLowerCase();
}

/** Match leaderboard row to signed-in X user (numeric id or @handle). */
export function playerMatchesSession(
  player: Pick<ApiLeaderboardPlayer, "user_id" | "user_handle">,
  session: {
    user?: { id?: string; name?: string | null; username?: string | null };
  } | null,
): boolean {
  if (!session?.user) return false;

  const sessionUserId = getTwitterUserIdFromSession(session);
  if (sessionUserId && String(player.user_id) === sessionUserId) {
    return true;
  }

  const sessionHandle = getTwitterHandleFromSession(session);
  if (!sessionHandle) return false;

  return normalizeTwitterHandle(player.user_handle) === sessionHandle;
}

export function findPlayerForSession(
  players: ApiLeaderboardPlayer[],
  session: {
    user?: { id?: string; name?: string | null; username?: string | null };
  } | null,
): ApiLeaderboardPlayer | undefined {
  return players.find((player) => playerMatchesSession(player, session));
}

/** Top N rows, always including the signed-in user when ranked. */
export function buildLeaderboardPreview(
  players: ApiLeaderboardPlayer[],
  session: {
    user?: { id?: string; name?: string | null; username?: string | null };
  } | null,
  limit: number,
): ApiLeaderboardPlayer[] {
  const preview = players.slice(0, limit);
  const me = findPlayerForSession(players, session);

  if (!me || preview.some((row) => playerMatchesSession(row, session))) {
    return preview;
  }

  return [...preview, me];
}

export function handleToUsername(handle: string): string {
  return handle.replace(/^@/, "");
}

export function handleToInitials(handle: string): string {
  const name = handleToUsername(handle);
  return name.slice(0, 2).toUpperCase();
}

export async function fetchMyLeaderboardStats(): Promise<{
  rank: number | null;
  total_points: number | null;
}> {
  const response = await fetch("/api/me/leaderboard-stats", { cache: "no-store" });
  if (response.status === 401) {
    return { rank: null, total_points: null };
  }
  if (!response.ok) {
    throw new Error("Could not load your leaderboard stats");
  }
  return (await response.json()) as { rank: number | null; total_points: number | null };
}

export async function fetchLeaderboard(
  limit?: number,
): Promise<ApiLeaderboardResponse> {
  const query = limit ? `?limit=${limit}` : "";
  const response = await fetch(`/api/leaderboard${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load leaderboard");
  }
  return (await response.json()) as ApiLeaderboardResponse;
}

import type { Fixture } from "../data/fixtures";

export type ApiNextMatchResponse = {
  fixture: (Fixture & { statusLabel?: string | null }) | null;
  statusLabel: string | null;
};

export type UpcomingMatch = Fixture & { statusLabel?: string | null };

export type ApiUpcomingMatchesResponse = {
  fixtures: UpcomingMatch[];
};

export async function fetchUpcomingMatches(
  limit?: number,
): Promise<UpcomingMatch[]> {
  const query = limit != null && limit > 0 ? `?limit=${limit}` : "";
  const response = await fetch(`/api/matches${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load upcoming matches");
  }
  const data = (await response.json()) as ApiUpcomingMatchesResponse;
  return data.fixtures ?? [];
}

export async function fetchNextMatch(): Promise<ApiNextMatchResponse> {
  const fixtures = await fetchUpcomingMatches(1);
  const fixture = fixtures[0] ?? null;
  return {
    fixture,
    statusLabel: fixture?.statusLabel ?? null,
  };
}

export async function fetchNextMatchStatus(): Promise<string | null> {
  const data = await fetchNextMatch();
  return data.statusLabel ?? null;
}
