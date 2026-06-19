import { getFixtureById, getUpcomingFixtures } from "@/app/data/fixtures";
import { resolveMatchPost, UI_MATCH_POST_OPTIONS } from "@/lib/resolveMatchTweet";
import { matchReplyIntentUrl } from "@/lib/xApi";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const matchIdParam = request.nextUrl.searchParams.get("matchId");
  const matchId = matchIdParam ? Number.parseInt(matchIdParam, 10) : NaN;

  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId must be an integer" }, { status: 400 });
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) {
    return NextResponse.json({ error: `Unknown matchId: ${matchId}` }, { status: 404 });
  }

  try {
    const post = await resolveMatchPost(fixture, UI_MATCH_POST_OPTIONS);
    if (!post) {
      return NextResponse.json(
        {
          matchId: fixture.id,
          fixture: `${fixture.home} vs ${fixture.away}`,
          found: false,
          account: process.env.X_MATCH_ACCOUNT?.replace("@", "") || "copamundialapp",
          hint: "This match post has not been posted yet. Follow @copamundialapp on X to keep an eye out.",
        },
        { status: 404 },
      );
    }

    const exampleReply = `${fixture.home} 2 – 1 ${fixture.away}`;

    return NextResponse.json({
      matchId: fixture.id,
      fixture: `${fixture.home} vs ${fixture.away}`,
      found: true,
      tweetId: post.tweetId,
      postUrl: post.url,
      replyIntentUrl: matchReplyIntentUrl(post.tweetId),
      account: post.account,
      source: post.source,
      exampleReply,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve match post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  const upcoming = getUpcomingFixtures();
  const results = [];

  for (const fixture of upcoming) {
    try {
      const post = await resolveMatchPost(fixture, {
        trustCachedTweet: true,
        discoverMaxPages: 1,
      });
      results.push({
        matchId: fixture.id,
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

  return NextResponse.json({ syncedAt: new Date().toISOString(), results });
}
