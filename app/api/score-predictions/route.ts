import { getFixtureById } from "@/app/data/fixtures";
import { isMatchScored, scoreMatchPredictions } from "@/app/lib/supabase";
import { isCollectAuthorized } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";

type ScoreRequestBody = {
  matchId?: number;
  homeScore?: number;
  awayScore?: number;
};

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 20;
}

export async function POST(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ScoreRequestBody;
  try {
    body = (await request.json()) as ScoreRequestBody;
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

  const homeScore = body.homeScore ?? fixture.result?.homeScore;
  const awayScore = body.awayScore ?? fixture.result?.awayScore;

  if (!isValidScore(homeScore) || !isValidScore(awayScore)) {
    return NextResponse.json(
      {
        error:
          "Final score required: pass homeScore and awayScore in the body, or set fixture.result in fixtures.ts",
      },
      { status: 400 },
    );
  }

  if (await isMatchScored(matchId)) {
    return NextResponse.json(
      { error: `Match ${matchId} has already been scored` },
      { status: 409 },
    );
  }

  try {
    const result = await scoreMatchPredictions(matchId, { homeScore, awayScore });
    return NextResponse.json({
      fixture: `${fixture.home} vs ${fixture.away}`,
      pointsRules: {
        exactScoreline: 5,
        correctOutcome: 3,
        participation: 1,
      },
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scoring failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
