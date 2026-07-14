import { isCronAuthorized } from "@/lib/cronAuth";
import { runLivePredictionReplyBot } from "@/lib/runLivePredictionReplyBot";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Poll open (pre-kickoff) match threads and reply under new valid predictions.
 * Incremental since_id scans; flushes pending queue (8s gap, stop on X 429).
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLivePredictionReplyBot();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live reply bot failed";
    console.error(`[reply-bot] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
