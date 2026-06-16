import { auth } from "@/auth";
import {
  createVideoUploadUrl,
  getBounty,
  isBountyOpen,
} from "@/app/lib/bounties";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { getTwitterUserIdFromSession } from "@/lib/twitterUserId";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

type UploadUrlBody = {
  bountyId?: unknown;
  fileName?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = getTwitterUserIdFromSession(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Sign in with X first" }, { status: 401 });
  }

  const limit = checkRateLimit(`bounty-upload:${userId}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const ipLimit = checkRateLimit(
    `bounty-upload:ip:${clientIp(request)}`,
    20,
    60_000,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: UploadUrlBody;
  try {
    body = (await request.json()) as UploadUrlBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bountyId = typeof body.bountyId === "string" ? body.bountyId : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  if (!bountyId || !fileName) {
    return NextResponse.json(
      { error: "bountyId and fileName are required" },
      { status: 400 },
    );
  }

  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "Video must be .mp4, .webm, .mov or .m4v" },
      { status: 400 },
    );
  }

  try {
    const bounty = await getBounty(bountyId);
    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (!isBountyOpen(bounty)) {
      return NextResponse.json(
        { error: "Submissions are closed for this bounty" },
        { status: 403 },
      );
    }

    // One object per user per bounty — re-uploading replaces the previous video.
    const path = `${bountyId}/${userId}.${extension}`;
    const upload = await createVideoUploadUrl(path);

    return NextResponse.json({
      path: upload.path,
      token: upload.token,
      signedUrl: upload.signedUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
