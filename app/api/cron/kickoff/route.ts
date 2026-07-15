import { isCronAuthorized } from "@/lib/cronAuth";
import { runDuePredictionCollection } from "@/lib/runDueCollection";
import {
  autoScoreFinishedMatches,
  getFixturesPendingAutoScoreFromSlate,
  runAutoScoreMaintenance,
} from "@/lib/scoreFinishedMatches";
import { syncLiveMatchGoals } from "@/lib/syncLiveMatchGoals";
import { syncNewFixturesFromTxline } from "@/lib/syncNewFixturesFromTxline";
import {
  registryGap,
  syncFixtureRegistryToSupabase,
} from "@/lib/syncFixtureRegistry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
/** Scoring + X collection + proof maintenance; 60s caused live-match 504s. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const registry = await syncFixtureRegistryToSupabase();
    const registryMissing = registryGap(registry);

    // Score before X collection so a slow collect cannot block leaderboard updates.
    const pendingScore = await getFixturesPendingAutoScoreFromSlate();
    const scoreResults = await autoScoreFinishedMatches(pendingScore, {
      // Collection is time-critical during live matches; proof/scorer maintenance
      // runs after collect so a slow TxLINE upgrade cannot starve X fetches.
      skipMaintenance: true,
    });
    const liveGoals = await syncLiveMatchGoals();
    const txlineRegistry = await syncNewFixturesFromTxline();
    const collection = await runDuePredictionCollection();
    const maintenance = await runAutoScoreMaintenance();

    console.info(
      `[kickoff] ok in ${Date.now() - startedAt}ms collection=${collection.length} scored=${scoreResults.filter((r) => r.status === "scored").length}`,
    );

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      registry: {
        expected: registry.expectedMatchIds,
        registered: registry.registeredMatchIds,
        created: registry.created,
        updated: registry.updated,
        missing: registryMissing,
        skipped: registry.skipped,
        errors: registry.errors,
      },
      txlineRegistry: {
        inserted: txlineRegistry.inserted,
        updated: txlineRegistry.updated,
        awaitingTweet: txlineRegistry.awaitingTweet,
      },
      scoring: scoreResults,
      liveGoals,
      collection,
      maintenance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kickoff cron failed";
    console.error(`[kickoff] failed in ${Date.now() - startedAt}ms: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
