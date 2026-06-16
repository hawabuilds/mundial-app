import { snapshotEpochLeaderboard } from "@/lib/snapshotEpoch";
import { isCronAuthorized } from "@/lib/cronAuth";
import { toJsonSafe } from "@/lib/jsonBigInt";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await snapshotEpochLeaderboard();
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      result: toJsonSafe(result),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Epoch snapshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
