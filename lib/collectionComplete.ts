import type { Fixture } from "@/app/data/fixtures";
import {
  countPredictionsForMatch,
  getMatchState,
  resetMatchCollection,
  clearMatchTweetId,
} from "@/app/lib/supabase";
import type { CollectResult } from "./collectPredictions";

/**
 * Only mark predictions_collected_at when we actually fetched a reply thread.
 * Prevents locking a match after collecting from a wrong/deleted tweet (0 replies).
 */
export function shouldMarkMatchCollected(result: CollectResult): boolean {
  return result.repliesFetched > 0;
}

/**
 * Undo a bad collection (collected flag set but zero rows) so kickoff cron retries.
 */
export async function healStaleCollectionState(fixture: Fixture): Promise<boolean> {
  const state = await getMatchState(fixture.id);
  if (!state?.predictions_collected_at) return false;

  const count = await countPredictionsForMatch(fixture.id);
  if (count > 0) return false;

  await resetMatchCollection(fixture.id);
  if (!fixture.tweetId?.trim()) {
    await clearMatchTweetId(fixture.id);
  }
  return true;
}
