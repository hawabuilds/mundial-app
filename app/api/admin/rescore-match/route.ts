import { isCollectAuthorized } from "@/lib/cronAuth";
import {
  KNOCKOUT_MATCH_IDS,
  rescoreMatches,
} from "@/lib/rescoreMatch";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let matchIds: number[] = [...KNOCKOUT_MATCH_IDS];
    try {
      const body = (await request.json()) as { matchIds?: number[] };
      if (Array.isArray(body.matchIds) && body.matchIds.length > 0) {
        matchIds = body.matchIds.filter(
          (id) => Number.isFinite(id) && id > 0,
        ) as number[];
      }
    } catch {
      /* default knockout list */
    }

    const results = await rescoreMatches(matchIds);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rescore failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
