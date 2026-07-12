import { isCronAuthorized } from "@/lib/cronAuth";
import { runPredictionBackfill } from "@/lib/runPredictionBackfill";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every-15-minute X outage backfill for the two missed QF prediction threads.
 * Collects + scores only — never opens a payout epoch or unpauses SNAPSHOT_PAUSED.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPredictionBackfill();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Prediction backfill failed";
    console.error(`[backfill-predictions] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
