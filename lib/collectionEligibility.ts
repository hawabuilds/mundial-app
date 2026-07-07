import type { Fixture } from "@/app/data/fixtures";
import {
  getMatchState,
  getStoredMatchTweetId,
} from "@/app/lib/supabase";
import { FIXTURE_STATUS_NEEDS_THREAD } from "@/lib/fixtureLifecycle";

export type CollectionEligibility = {
  ok: boolean;
  reason?: string;
};

function fixtureHasManualTweet(fixture: Fixture): boolean {
  return Boolean(fixture.tweetId?.trim());
}

/**
 * Auto-inserted fixtures stay out of collection until saveMatchTweetId registers
 * the X thread. Static fixtures without a stored id may still use X discovery.
 */
export async function checkCollectionEligibility(
  fixture: Fixture,
): Promise<CollectionEligibility> {
  if (fixtureHasManualTweet(fixture)) {
    return { ok: true };
  }

  const state = await getMatchState(fixture.id);
  if (!state) {
    return { ok: true };
  }

  if (state.fixture_status !== FIXTURE_STATUS_NEEDS_THREAD) {
    return { ok: true };
  }

  const storedTweetId = await getStoredMatchTweetId(fixture.id);
  if (storedTweetId) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      "Awaiting X thread id — register via saveMatchTweetId before collection",
  };
}
