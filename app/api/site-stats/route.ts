import { getSiteStats } from "@/lib/siteStats";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getSiteStats();
    return NextResponse.json(stats);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load site stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
