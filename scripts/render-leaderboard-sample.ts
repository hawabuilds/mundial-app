/**
 * Render a sample daily-leaderboard PNG from real standings (latest snapshot or live board).
 *
 *   npx tsx scripts/render-leaderboard-sample.ts
 *   npx tsx scripts/render-leaderboard-sample.ts --epoch 20260711
 */
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

config({ path: ".env.local" });

import { getSupabaseAdminClient } from "../app/lib/supabase";
import type { LeaderboardEntry } from "../app/lib/supabase";
import { isTopTwentyRank } from "../lib/payoutTiers";
import { renderLeaderboardImage } from "../lib/renderLeaderboardImage";
import { getLeaderboard } from "../app/lib/supabase";

const OUTPUT = join(
  process.cwd(),
  "docs/screenshots/daily-leaderboard-sample.png",
);

function parseEpochArg(): bigint | null {
  const idx = process.argv.indexOf("--epoch");
  if (idx >= 0 && process.argv[idx + 1]) {
    return BigInt(process.argv[idx + 1]!);
  }
  return null;
}

async function loadStandingsForEpoch(
  epochId: bigint,
): Promise<LeaderboardEntry[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("rank, user_id, user_handle, total_points")
    .eq("epoch_id", Number(epochId))
    .order("rank", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    rank: row.rank,
    user_id: row.user_id,
    user_handle: row.user_handle,
    total_points: row.total_points,
  }));
}

async function resolveLatestSnapshotEpoch(): Promise<bigint | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .select("epoch_id")
    .order("epoch_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.epoch_id != null ? BigInt(data.epoch_id) : null;
}

async function main() {
  let epochId = parseEpochArg();

  let standings: LeaderboardEntry[];
  if (epochId) {
    standings = await loadStandingsForEpoch(epochId);
    if (standings.length === 0) {
      console.warn(`No snapshot rows for epoch ${epochId}; falling back to live leaderboard`);
      standings = (await getLeaderboard(20)).filter((entry) =>
        isTopTwentyRank(entry.rank),
      );
    }
  } else {
    epochId = await resolveLatestSnapshotEpoch();
    if (epochId) {
      standings = await loadStandingsForEpoch(epochId);
    } else {
      epochId = BigInt(
        new Date().toISOString().slice(0, 10).replace(/-/g, ""),
      );
      standings = (await getLeaderboard(20)).filter((entry) =>
        isTopTwentyRank(entry.rank),
      );
    }
  }

  if (standings.length === 0) {
    throw new Error("No leaderboard standings available to render");
  }

  const png = await renderLeaderboardImage({ epochId, standings });
  await mkdir(join(process.cwd(), "docs/screenshots"), { recursive: true });
  await writeFile(OUTPUT, png);

  console.log(
    JSON.stringify({
      ok: true,
      output: OUTPUT,
      epochId: epochId.toString(),
      rows: standings.length,
      top3: standings.slice(0, 3).map((row) => ({
        rank: row.rank,
        handle: row.user_handle,
        points: row.total_points,
      })),
    }),
  );
}

void main();
