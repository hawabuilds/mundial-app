import { isCronAuthorized } from "@/lib/cronAuth";
import {
  autoScoreFinishedMatches,
  getFixturesPendingAutoScore,
} from "@/lib/scoreFinishedMatches";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual / backup only — kickoff cron runs scoring every 5 min in production. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pendingScore = await getFixturesPendingAutoScore();
    const results = await autoScoreFinishedMatches(pendingScore);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      note: "Backup scorer — production uses /api/cron/kickoff every 5 min",
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-score failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
