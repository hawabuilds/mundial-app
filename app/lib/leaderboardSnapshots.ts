import { getSupabaseAdminClient } from "@/app/lib/supabase";
import type { LeaderboardEntry } from "@/app/lib/supabase";

export type LeaderboardSnapshotRow = {
  epoch_id: number;
  user_id: string;
  user_handle: string;
  rank: number;
  total_points: number;
  created_at: string;
};

export async function getSnapshotEntry(
  epochId: bigint,
  userId: string,
): Promise<LeaderboardSnapshotRow | null> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);

  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("epoch_id, user_id, user_handle, rank, total_points, created_at")
    .eq("epoch_id", epochNumeric)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as LeaderboardSnapshotRow | null) ?? null;
}

export async function getSnapshotEntryByHandle(
  epochId: bigint,
  handle: string,
): Promise<LeaderboardSnapshotRow | null> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();

  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("epoch_id, user_id, user_handle, rank, total_points, created_at")
    .eq("epoch_id", epochNumeric);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as LeaderboardSnapshotRow[];
  return (
    rows.find(
      (row) =>
        row.user_handle.replace(/^@/, "").trim().toLowerCase() === normalized,
    ) ?? null
  );
}

export async function insertLeaderboardSnapshot(
  epochId: bigint,
  entries: LeaderboardEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;

  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);
  const now = new Date().toISOString();

  const rows = entries.map((entry) => ({
    epoch_id: epochNumeric,
    user_id: entry.user_id,
    user_handle: entry.user_handle,
    rank: entry.rank,
    total_points: entry.total_points,
    created_at: now,
  }));

  const { error } = await supabase.from("leaderboard_snapshots").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  return rows.length;
}

export async function countSnapshotRows(epochId: bigint): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);

  const { count, error } = await supabase
    .from("leaderboard_snapshots")
    .select("user_id", { count: "exact", head: true })
    .eq("epoch_id", epochNumeric);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}
