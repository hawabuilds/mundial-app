import type { Fixture } from "@/app/data/fixtures";
import {
  getMatchState,
  isEffectivelyCollected,
  isMatchScored,
  markMatchCollected,
  rescoreCollectedMatch,
} from "@/app/lib/supabase";
import { checkCollectionEligibility } from "@/lib/collectionEligibility";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import {
  healStaleCollectionState,
  shouldMarkMatchCollected,
} from "@/lib/collectionComplete";
import {
  filterBacklogFixturesForCollection,
  filterFixturesForCollection,
  getFixturesDueForCollection,
  isWithinCollectionBacklogWindow,
} from "@/lib/kickoff";
import {
  buildTxStartTimeByFixtureId,
  resolveTxStartTimeForFixture,
} from "@/lib/effectiveKickoff";
import { fetchFixturesSnapshot, isTxoddsConfigured } from "@/lib/txodds";
import {
  COLLECTION_MATCH_POST_OPTIONS,
  CRON_MATCH_POST_OPTIONS,
  resolveMatchPost,
} from "@/lib/resolveMatchTweet";
import { getCollectionFixtureSlate } from "@/lib/syncNewFixturesFromTxline";
import { getStoredMatchTweetId } from "@/app/lib/supabase";

export type CollectionPassResult = Record<string, unknown>;

/** Fetch X replies for fixtures due for collection; rescore if score landed first. */
export async function runDuePredictionCollection(): Promise<CollectionPassResult[]> {
  const txFixtures = isTxoddsConfigured() ? await fetchFixturesSnapshot() : [];
  const startByTxId = buildTxStartTimeByFixtureId(txFixtures);
  const resolveEffectiveKickoffMs = (fixture: Fixture) =>
    resolveTxStartTimeForFixture(fixture, startByTxId, txFixtures);

  const now = new Date();
  const slate = await getCollectionFixtureSlate();
  const backlogSlate = slate.filter((fixture) =>
    isWithinCollectionBacklogWindow(fixture, now, resolveEffectiveKickoffMs(fixture) ?? undefined),
  );

  const slotDueFixtures = await filterFixturesForCollection(
    getFixturesDueForCollection(now, slate),
    async (matchId) => {
      const state = await getMatchState(matchId);
      const at = state?.predictions_collected_at;
      return at ? new Date(at) : null;
    },
    isEffectivelyCollected,
    now,
    resolveEffectiveKickoffMs,
  );

  const backlogDueFixtures = await filterBacklogFixturesForCollection(
    backlogSlate,
    async (matchId) => Boolean(await getStoredMatchTweetId(matchId)),
    isEffectivelyCollected,
    now,
    resolveEffectiveKickoffMs,
  );

  const seenMatchIds = new Set<number>();
  const dueFixtures = [...slotDueFixtures, ...backlogDueFixtures].filter(
    (fixture) => {
      if (seenMatchIds.has(fixture.id)) return false;
      seenMatchIds.add(fixture.id);
      return true;
    },
  );

  const results: CollectionPassResult[] = [];

  for (const fixture of dueFixtures) {
    try {
      const eligibility = await checkCollectionEligibility(fixture);
      if (!eligibility.ok) {
        results.push({
          matchId: fixture.id,
          status: "skipped",
          reason: eligibility.reason,
        });
        continue;
      }

      if (await healStaleCollectionState(fixture)) {
        results.push({
          matchId: fixture.id,
          status: "healed",
          reason: "Cleared stale collected flag (0 predictions) — will retry",
        });
      }

      const alreadyScored = await isMatchScored(fixture.id);

      const post =
        (await resolveMatchPost(fixture, COLLECTION_MATCH_POST_OPTIONS)) ??
        (await resolveMatchPost(fixture, CRON_MATCH_POST_OPTIONS));
      if (!post) {
        results.push({
          matchId: fixture.id,
          status: "skipped",
          reason: `No match post found for fixture ${fixture.id}`,
        });
        continue;
      }

      const effectiveKickoffMs = resolveTxStartTimeForFixture(
        fixture,
        startByTxId,
        txFixtures,
      );
      const result = await collectPredictionsForFixture(
        fixture,
        post.tweetId,
        effectiveKickoffMs ?? undefined,
      );
      if (shouldMarkMatchCollected(result)) {
        await markMatchCollected(fixture.id);
        const rescore = alreadyScored
          ? await rescoreCollectedMatch(fixture.id, fixture)
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

  return results;
}
