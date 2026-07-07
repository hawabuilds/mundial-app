import { isCronAuthorized } from "@/lib/cronAuth";
import { syncNewFixturesFromTxline } from "@/lib/syncNewFixturesFromTxline";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncNewFixturesFromTxline();
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      awaitingTweet: result.awaitingTweet,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "sync-fixtures cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
