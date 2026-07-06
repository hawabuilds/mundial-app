import { getFixtureById } from "@/app/data/fixtures";
import { getMatchProof, toMatchProofSummary } from "@/app/lib/supabase";
import { isCollectAuthorized } from "@/lib/cronAuth";
import { fetchAndPersistMatchProof, refreshStoredProofSemantics } from "@/lib/matchProofFetch";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Body = {
  matchId?: number;
  matchIds?: number[];
  force?: boolean;
};

export async function POST(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* default match 74 */
  }

  const force = body.force === true;
  const ids =
    Array.isArray(body.matchIds) && body.matchIds.length > 0
      ? body.matchIds.filter((id) => Number.isFinite(id) && id > 0)
      : [typeof body.matchId === "number" ? body.matchId : 74];

  const results = [];
  for (const matchId of ids) {
    const fixture = getFixtureById(matchId);
    if (!fixture) {
      results.push({ matchId, error: "unknown match" });
      continue;
    }
    const outcome = await fetchAndPersistMatchProof(matchId, fixture, { force });
    let stored = await getMatchProof(matchId).catch(() => null);
    if (stored && !stored.showVerifiedBadge) {
      await refreshStoredProofSemantics(matchId, fixture, stored);
      stored = await getMatchProof(matchId).catch(() => null);
    }
    results.push({
      matchId,
      ...outcome,
      proof: stored ? toMatchProofSummary(stored) : null,
    });
  }

  return NextResponse.json({ ok: true, results });
}
