import { isCronAuthorized } from "@/lib/cronAuth";
import { autoScoreFinishedMatches } from "@/lib/scoreFinishedMatches";
import { syncFixtureRegistryToSupabase } from "@/lib/syncFixtureRegistry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const registry = await syncFixtureRegistryToSupabase();
    const results = await autoScoreFinishedMatches();
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      registry: {
        expected: registry.expectedMatchIds,
        registered: registry.registeredMatchIds,
      },
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto-score failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
