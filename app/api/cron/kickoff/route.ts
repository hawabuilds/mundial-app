import { isCronAuthorized } from "@/lib/cronAuth";
import { runDuePredictionCollection } from "@/lib/runDueCollection";
import {
  autoScoreFinishedMatches,
  getFixturesPendingAutoScore,
} from "@/lib/scoreFinishedMatches";
import {
  registryGap,
  syncFixtureRegistryToSupabase,
} from "@/lib/syncFixtureRegistry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const registry = await syncFixtureRegistryToSupabase();
    const registryMissing = registryGap(registry);

    // Score before X collection so a slow collect cannot block leaderboard updates.
    const pendingScore = await getFixturesPendingAutoScore();
    const scoreResults = await autoScoreFinishedMatches(pendingScore);
    const collection = await runDuePredictionCollection();

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      registry: {
        expected: registry.expectedMatchIds,
        registered: registry.registeredMatchIds,
        created: registry.created,
        updated: registry.updated,
        missing: registryMissing,
        skipped: registry.skipped,
        errors: registry.errors,
      },
      scoring: scoreResults,
      collection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kickoff cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
