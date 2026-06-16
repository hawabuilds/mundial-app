import type { Fixture } from "@/app/data/fixtures";
import { fixtureCacheKey } from "@/app/data/fixtures";
import {
  clearMatchTweetId,
  getMatchState,
  saveMatchTweetId,
} from "@/app/lib/supabase";
import {
  discoverMatchPost,
  tweetIsValidMatchPost,
  type DiscoveredMatchPost,
} from "@/lib/xMatchPosts";
import { fetchTweetById, getMatchPostAccount, matchPostUrl } from "@/lib/xApi";

export type ResolveMatchPostOptions = {
  /**
   * When true, use Supabase tweet id without X validation (UI only — saves API calls).
   * Background jobs must use {@link CRON_MATCH_POST_OPTIONS} so stale ids are cleared.
   */
  trustCachedTweet?: boolean;
  /** Search pages when discovering — keep 1 for UI, 2 for background sync. */
  discoverMaxPages?: number;
};

/** Predict modal / match-post API — fast path, may use cached id. */
export const UI_MATCH_POST_OPTIONS: ResolveMatchPostOptions = {
  trustCachedTweet: true,
  discoverMaxPages: 1,
};

/** Kickoff, sync, collection, scoring — always validate cache or re-discover. */
export const CRON_MATCH_POST_OPTIONS: ResolveMatchPostOptions = {
  trustCachedTweet: false,
  discoverMaxPages: 2,
};

function fixtureTweetId(fixture: Fixture): string | null {
  const manualTweetId = fixture.tweetId?.trim();
  return manualTweetId || null;
}

function toMatchPost(
  tweetId: string,
  account: string,
  source: DiscoveredMatchPost["source"],
  text = "",
): DiscoveredMatchPost {
  return {
    tweetId,
    text,
    url: matchPostUrl(tweetId, account),
    account,
    source,
  };
}

async function cacheTweetId(fixture: Fixture, tweetId: string): Promise<void> {
  try {
    await saveMatchTweetId(fixture.id, tweetId, fixtureCacheKey(fixture));
  } catch {
    // Caching is optional — discovery still works without Supabase.
  }
}

/** Use tweet id stored in Supabase — no X API call. */
async function readTrustedCachedPost(
  fixture: Fixture,
  account: string,
): Promise<DiscoveredMatchPost | null> {
  let state;
  try {
    state = await getMatchState(fixture.id);
  } catch {
    return null;
  }

  const storedTweetId = state?.match_tweet_id?.trim();
  if (!storedTweetId || !state) return null;

  const expectedKey = fixtureCacheKey(fixture);
  if (state.match_fixture_key && state.match_fixture_key !== expectedKey) {
    return null;
  }

  return toMatchPost(storedTweetId, account, "database");
}

/** Validates cached id via X; clears Supabase cache when invalid. */
async function readVerifiedCachedPost(
  fixture: Fixture,
  account: string,
): Promise<DiscoveredMatchPost | null> {
  const trusted = await readTrustedCachedPost(fixture, account);
  if (!trusted) return null;

  try {
    const hit = await fetchTweetById(trusted.tweetId);
    if (!hit) {
      await clearMatchTweetId(fixture.id);
      return null;
    }
    if (hit.authorUsername.toLowerCase() !== account.toLowerCase()) {
      await clearMatchTweetId(fixture.id);
      return null;
    }

    if (!tweetIsValidMatchPost(hit, fixture)) {
      await clearMatchTweetId(fixture.id);
      return null;
    }

    return toMatchPost(trusted.tweetId, account, "database", hit.text);
  } catch {
    return null;
  }
}

export async function resolveMatchPost(
  fixture: Fixture,
  options: ResolveMatchPostOptions = CRON_MATCH_POST_OPTIONS,
): Promise<DiscoveredMatchPost | null> {
  const account = getMatchPostAccount();
  const trustCached = options.trustCachedTweet ?? false;
  const discoverMaxPages = options.discoverMaxPages ?? 2;

  const manualTweetId = fixtureTweetId(fixture);
  if (manualTweetId) {
    await cacheTweetId(fixture, manualTweetId);
    return toMatchPost(manualTweetId, account, "fixture");
  }

  if (trustCached) {
    const trusted = await readTrustedCachedPost(fixture, account);
    if (trusted) return trusted;
  } else {
    const verified = await readVerifiedCachedPost(fixture, account);
    if (verified) return verified;
  }

  const discovered = await discoverMatchPost(fixture, discoverMaxPages);
  if (discovered) {
    await cacheTweetId(fixture, discovered.tweetId);
    return discovered;
  }

  return null;
}

export async function resolveMatchTweetId(
  fixture: Fixture,
  options?: ResolveMatchPostOptions,
): Promise<string | null> {
  const post = await resolveMatchPost(fixture, options);
  return post?.tweetId ?? null;
}
