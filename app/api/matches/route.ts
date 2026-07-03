import { FIXTURES, getActiveFixtures } from "@/app/data/fixtures";
import {
  enrichNextFixture,
  enrichUpcomingFixtures,
  formatMatchStatus,
} from "@/lib/enrichFixtures";
import { getTxScheduleBoard } from "@/lib/txScheduleBoard";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nextOnly = request.nextUrl.searchParams.get("next") === "1";
  const board = request.nextUrl.searchParams.get("board") === "1";

  try {
    if (nextOnly) {
      const fixture = await enrichNextFixture(getActiveFixtures(FIXTURES));
      if (!fixture) {
        return NextResponse.json({ fixture: null, statusLabel: null });
      }

      return NextResponse.json({
        fixture,
        statusLabel: formatMatchStatus(fixture.live),
      });
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

    // Live board is sourced from the TxLINE schedule (in-progress + just-finished
    // stay on screen). The default (upcoming-only) mode uses the static fixtures
    // list and is left untouched for the Reply tab.
    const enriched = board
      ? await getTxScheduleBoard()
      : await enrichUpcomingFixtures(getActiveFixtures(FIXTURES));
    const fixtures = limit ? enriched.slice(0, limit) : enriched;
    return NextResponse.json({
      fixtures: fixtures.map((fixture) => ({
        ...fixture,
        statusLabel: formatMatchStatus(fixture.live),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load matches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
