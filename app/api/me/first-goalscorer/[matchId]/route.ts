import { auth } from "@/auth";
import { getTeamCountryCode } from "@/app/data/fixtures";
import {
  resolveFixtureForFirstGoalscorer,
  resolveScorePredictionForFirstGoalscorer,
  clearFirstGoalscorerEligibilityCache,
} from "@/lib/firstGoalscorerEligibility";
import {
  getFirstGoalscorerPredictionForUser,
  saveFirstGoalscorerPrediction,
} from "@/app/lib/firstGoalscorerPredictions";
import { fetchMatchLineupPlayers } from "@/lib/matchLineups";
import {
  assertBeforeKickoff,
  resolveFixtureKickoffMs,
} from "@/lib/firstGoalscorerPredictionLock";
import { resolveCanonicalUserId } from "@/app/lib/resolveCanonicalUserId";
import { getTwitterHandleFromSession } from "@/lib/twitterUserId";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ matchId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matchId = Number.parseInt((await params).matchId, 10);
  if (!Number.isFinite(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
  }

  const fixture = await resolveFixtureForFirstGoalscorer(matchId);
  if (!fixture) {
    return NextResponse.json({ error: "Unknown match" }, { status: 404 });
  }

  try {
    const userId = await resolveCanonicalUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Could not resolve X user id" }, { status: 400 });
    }

    const kickoffMs = await resolveFixtureKickoffMs(matchId, fixture);
    const locked = Date.now() >= kickoffMs;
    const scorePrediction = await resolveScorePredictionForFirstGoalscorer({
      userId,
      matchId,
      fixture,
    });
    const existing = await getFirstGoalscorerPredictionForUser(userId, matchId);

    const txFixtureId = fixture.externalFixtureId ?? null;
    const lineupPlayers =
      txFixtureId != null
        ? await fetchMatchLineupPlayers({ txFixtureId, homeIsP1: true })
        : [];

    return NextResponse.json({
      matchId,
      fixture: {
        home: fixture.home,
        away: fixture.away,
        homeCode: getTeamCountryCode(fixture.home) ?? "XX",
        awayCode: getTeamCountryCode(fixture.away) ?? "XX",
      },
      eligible: Boolean(scorePrediction),
      scoreSource: scorePrediction?.source ?? null,
      locked,
      kickoffAt: new Date(kickoffMs).toISOString(),
      scorePrediction: scorePrediction
        ? {
            home: scorePrediction.home,
            away: scorePrediction.away,
          }
        : null,
      prediction: existing
        ? {
            playerId: existing.player_id,
            playerName: existing.player_name,
            playerSide: existing.player_side,
            predictedAt: existing.predicted_at,
          }
        : null,
      lineup: {
        source: lineupPlayers.length > 0 ? "txline" : "manual",
        players: lineupPlayers,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load first goalscorer state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matchId = Number.parseInt((await params).matchId, 10);
  if (!Number.isFinite(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
  }

  const fixture = await resolveFixtureForFirstGoalscorer(matchId);
  if (!fixture) {
    return NextResponse.json({ error: "Unknown match" }, { status: 404 });
  }

  let body: {
    playerId?: number | null;
    playerName?: string;
    playerSide?: "home" | "away";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const playerName = body.playerName?.trim() ?? "";
  const playerSide = body.playerSide;
  if (!playerName || (playerSide !== "home" && playerSide !== "away")) {
    return NextResponse.json(
      { error: "playerName and playerSide (home|away) are required" },
      { status: 400 },
    );
  }

  const playerId =
    typeof body.playerId === "number" && Number.isFinite(body.playerId)
      ? body.playerId
      : null;

  try {
    const userId = await resolveCanonicalUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Could not resolve X user id" }, { status: 400 });
    }

    const kickoffMs = await resolveFixtureKickoffMs(matchId, fixture);
    assertBeforeKickoff(fixture, kickoffMs);

    const scorePrediction = await resolveScorePredictionForFirstGoalscorer({
      userId,
      matchId,
      fixture,
    });
    if (!scorePrediction) {
      return NextResponse.json(
        { error: "Post your scoreline prediction on X before picking a first goalscorer." },
        { status: 403 },
      );
    }

    const sessionHandle = getTwitterHandleFromSession(session);
    const handle =
      sessionHandle != null
        ? sessionHandle.startsWith("@")
          ? sessionHandle
          : `@${sessionHandle}`
        : scorePrediction.user_handle;

    const saved = await saveFirstGoalscorerPrediction({
      user_id: userId,
      user_handle: handle,
      match_id: matchId,
      player_id: playerId,
      player_name: playerName,
      player_side: playerSide,
    });

    clearFirstGoalscorerEligibilityCache(userId, matchId);

    return NextResponse.json({
      prediction: {
        playerId: saved.player_id,
        playerName: saved.player_name,
        playerSide: saved.player_side,
        predictedAt: saved.predicted_at,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save first goalscorer pick";
    const status = message.includes("lock at kickoff") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
