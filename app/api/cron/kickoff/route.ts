import {
  getMatchState,
  isMatchScored,
  markMatchCollected,
  rescoreCollectedMatch,
} from "@/app/lib/supabase";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import { isCronAuthorized } from "@/lib/cronAuth";
import {
  filterFixturesForCollection,
  getFixturesDueForCollection,
} from "@/lib/kickoff";
import {
  healStaleCollectionState,
  shouldMarkMatchCollected,
} from "@/lib/collectionComplete";
import { CRON_MATCH_POST_OPTIONS, resolveMatchPost } from "@/lib/resolveMatchTweet";
import { autoScoreFinishedMatches, getFixturesPendingAutoScore } from "@/lib/scoreFinishedMatches";
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

    const dueFixtures = await filterFixturesForCollection(
      getFixturesDueForCollection(),
      async (matchId) => {
        const state = await getMatchState(matchId);
        const at = state?.predictions_collected_at;
        return at ? new Date(at) : null;
      },
    );

    const results: Array<Record<string, unknown>> = [];

    for (const fixture of dueFixtures) {
      try {
        if (await healStaleCollectionState(fixture)) {
          results.push({
            matchId: fixture.id,
            status: "healed",
            reason: "Cleared stale collected flag (0 predictions) — will retry",
          });
        }

        const alreadyScored = await isMatchScored(fixture.id);

        const post = await resolveMatchPost(fixture, CRON_MATCH_POST_OPTIONS);
        if (!post) {
          results.push({
            matchId: fixture.id,
            status: "error",
            error: `No match post found for fixture ${fixture.id}`,
          });
          continue;
        }

        const result = await collectPredictionsForFixture(fixture);
        if (shouldMarkMatchCollected(result)) {
          await markMatchCollected(fixture.id);
          const rescore = alreadyScored
            ? await rescoreCollectedMatch(fixture.id)
            : null;
          results.push({
            matchId: fixture.id,
            status: "collected",
            result,
            ...(rescore ? { rescored: rescore } : {}),
          });
        } else {
          results.push({
            matchId: fixture.id,
            status: "skipped",
            reason:
              "No replies on match post — not marking collected (will retry; check tweet id)",
            tweetId: post.tweetId,
            result,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Collection failed";
        results.push({ matchId: fixture.id, status: "error", error: message });
      }
    }

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
      dueForCollection: dueFixtures.map((f) => f.id),
      collection: results,
      scoring: scoreResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kickoff cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
