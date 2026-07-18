import { auth } from "@/auth";
import { listFirstGoalscorerOpportunities } from "@/lib/firstGoalscorerEligibility";
import { resolveCanonicalUserId } from "@/app/lib/resolveCanonicalUserId";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("matchIds") ?? "";
  const matchIds = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (matchIds.length === 0) {
    return NextResponse.json({ opportunities: [] });
  }

  try {
    const userId = await resolveCanonicalUserId(session);
    if (!userId) {
      return NextResponse.json({ opportunities: [] });
    }

    const opportunities = await listFirstGoalscorerOpportunities(userId, matchIds);
    return NextResponse.json({ opportunities });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load opportunities";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
