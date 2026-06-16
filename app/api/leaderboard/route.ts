import { getLeaderboard } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const allPlayers = await getLeaderboard();
    const players =
      limit && Number.isInteger(limit) && limit > 0
        ? allPlayers.slice(0, limit)
        : allPlayers;

    return NextResponse.json({
      players,
      totalPlayers: allPlayers.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
