import {
  FIXTURES,
  fixtureDateTime,
  getActiveFixtures,
} from "@/app/data/fixtures";
import { isCronAuthorized } from "@/lib/cronAuth";
import { CRON_MATCH_POST_OPTIONS, resolveMatchPost } from "@/lib/resolveMatchTweet";
import {
  registryGap,
  syncFixtureRegistryToSupabase,
} from "@/lib/syncFixtureRegistry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registry = await syncFixtureRegistryToSupabase();
  const registryMissing = registryGap(registry);

  const now = new Date();
  const upcoming = getActiveFixtures(FIXTURES).filter((fixture) => {
    const kickoff = fixtureDateTime(fixture);
    const hoursUntil = (kickoff.getTime() - now.getTime()) / (60 * 60 * 1000);
    return hoursUntil >= -2 && hoursUntil <= 168;
  });

  const results = [];

  for (const fixture of upcoming) {
    try {
      const post = await resolveMatchPost(fixture, CRON_MATCH_POST_OPTIONS);
      results.push({
        matchId: fixture.id,
        fixture: `${fixture.home} vs ${fixture.away}`,
        found: Boolean(post),
        tweetId: post?.tweetId ?? null,
        source: post?.source ?? null,
      });
    } catch (error) {
      results.push({
        matchId: fixture.id,
        found: false,
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    registry: {
      expected: registry.expectedMatchIds,
      registered: registry.registeredMatchIds,
      missing: registryMissing,
      skipped: registry.skipped,
      errors: registry.errors,
    },
    results,
  });
}
