import { isCollectAuthorized } from "@/lib/cronAuth";
import { listFixturesAwaitingTweet } from "@/lib/syncNewFixturesFromTxline";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Admin visibility: fixtures auto-inserted from TxLINE that still need an X thread. */
export async function GET(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const awaitingTweet = await listFixturesAwaitingTweet();
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      awaitingTweet,
      count: awaitingTweet.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "fixture-sync-status failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
