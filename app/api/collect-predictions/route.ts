import { getFixtureById } from "@/app/data/fixtures";
import { isMatchCollected, markMatchCollected } from "@/app/lib/supabase";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import { isCollectAuthorized } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";

type CollectRequestBody = {
  matchId?: number;
};

export async function POST(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CollectRequestBody;
  try {
    body = (await request.json()) as CollectRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const matchId = body.matchId;
  if (typeof matchId !== "number" || !Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId must be an integer" }, { status: 400 });
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) {
    return NextResponse.json({ error: `Unknown matchId: ${matchId}` }, { status: 404 });
  }

  try {
    const result = await collectPredictionsForFixture(fixture);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
