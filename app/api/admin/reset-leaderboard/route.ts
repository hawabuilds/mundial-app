import { isCollectAuthorized } from "@/lib/cronAuth";
import { resetLeaderboardData } from "@/lib/leaderboardReset";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await resetLeaderboardData();
    return NextResponse.json({
      ok: true,
      predictionsDeleted: result.predictionsDeleted,
      snapshotsDeleted: result.snapshotsDeleted,
      matchStateReset: result.matchStateReset,
      playersBefore: result.leaderboardBefore.length,
      playersAfter: result.leaderboardAfter.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
