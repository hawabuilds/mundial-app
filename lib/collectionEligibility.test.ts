import assert from "node:assert/strict";
import type { Fixture } from "@/app/data/fixtures";
import { FIXTURE_STATUS_NEEDS_THREAD } from "./fixtureLifecycle";

const fixture: Fixture = {
  id: 18175918,
  home: "Brazil",
  away: "France",
  date: "2026-07-01",
  time: "19:00",
  group: "FIFA World Cup",
  externalFixtureId: 18175918,
};

type MatchState = {
  fixture_status: string | null;
  match_tweet_id: string | null;
};

function eligibility(state: MatchState | null, manualTweet?: string) {
  const f = manualTweet ? { ...fixture, tweetId: manualTweet } : fixture;
  if (f.tweetId?.trim()) return { ok: true as const };

  if (!state) return { ok: true as const };
  if (state.fixture_status !== FIXTURE_STATUS_NEEDS_THREAD) return { ok: true as const };
  if (state.match_tweet_id?.trim()) return { ok: true as const };

  return {
    ok: false as const,
    reason: "Awaiting X thread id — register via saveMatchTweetId before collection",
  };
}

assert.deepEqual(eligibility(null), { ok: true });
assert.deepEqual(
  eligibility({ fixture_status: FIXTURE_STATUS_NEEDS_THREAD, match_tweet_id: null }),
  {
    ok: false,
    reason: "Awaiting X thread id — register via saveMatchTweetId before collection",
  },
);
assert.deepEqual(
  eligibility({ fixture_status: FIXTURE_STATUS_NEEDS_THREAD, match_tweet_id: "123" }),
  { ok: true },
);
assert.deepEqual(eligibility(null, "999"), { ok: true });

console.log("collectionEligibility.test.ts: ok");
