import { snapshotEpochLeaderboard } from "@/lib/snapshotEpoch";
import { isCronAuthorized } from "@/lib/cronAuth";
import { toJsonSafe } from "@/lib/jsonBigInt";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isSnapshotPaused(): boolean {
  const raw = process.env.SNAPSHOT_PAUSED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSnapshotPaused()) {
    console.log("snapshot paused");
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      result: {
        status: "skipped",
        reason: "snapshot paused",
      },
    });
  }

  try {
    const result = await snapshotEpochLeaderboard();
    console.log(
      `[snapshot-epoch] ${result.status}` +
        (result.status === "skipped"
          ? `: ${result.reason}`
          : ` epoch=${result.epochId} rows=${result.rows}`),
    );
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      result: toJsonSafe(result),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Epoch snapshot failed";
    console.error(`[snapshot-epoch] failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
