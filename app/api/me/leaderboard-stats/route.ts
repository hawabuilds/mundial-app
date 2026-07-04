import { auth } from "@/auth";
import {
  getLeaderboard,
  getUserScoringExtras,
} from "@/app/lib/supabase";
import { findPlayerForSession } from "@/app/lib/leaderboard-client";
import { getTwitterUserIdFromSession } from "@/lib/twitterUserId";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      {
        rank: null,
        total_points: null,
        upset_bonus_total: null,
        last_breakdown: null,
      },
      { status: 401 },
    );
  }

  try {
    const players = await getLeaderboard();
    const me = findPlayerForSession(players, session);
    const userId = getTwitterUserIdFromSession(session) ?? me?.user_id;

    let extras = {
      upsetBonusTotal: 0,
      lastBreakdown: null as Awaited<
        ReturnType<typeof getUserScoringExtras>
      >["lastBreakdown"],
    };

    if (userId) {
      extras = await getUserScoringExtras(userId);
    }

    return NextResponse.json({
      rank: me?.rank ?? null,
      total_points: me?.total_points ?? null,
      upset_bonus_total: extras.upsetBonusTotal,
      last_breakdown: extras.lastBreakdown
        ? {
            match_id: extras.lastBreakdown.match_id,
            prediction: extras.lastBreakdown.prediction,
            final: extras.lastBreakdown.final,
            base: extras.lastBreakdown.base,
            multiplier: extras.lastBreakdown.multiplier,
            points: extras.lastBreakdown.points,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
