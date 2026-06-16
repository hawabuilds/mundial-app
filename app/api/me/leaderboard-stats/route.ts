import { auth } from "@/auth";
import { getLeaderboard } from "@/app/lib/supabase";
import { findPlayerForSession } from "@/app/lib/leaderboard-client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ rank: null, total_points: null }, { status: 401 });
  }

  try {
    const players = await getLeaderboard();
    const me = findPlayerForSession(players, session);

    return NextResponse.json({
      rank: me?.rank ?? null,
      total_points: me?.total_points ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
