import { auth } from "@/auth";
import {
  getBounty,
  isBountyOpen,
  upsertSubmission,
} from "@/app/lib/bounties";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import {
  getTwitterHandleFromSession,
  getTwitterUserIdFromSession,
} from "@/lib/twitterUserId";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SOCIAL_POST_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "t.me",
  "www.instagram.com",
  "instagram.com",
  "www.tiktok.com",
  "tiktok.com",
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
]);

function parseSocialPostUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    if (!SOCIAL_POST_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

type SubmitBody = {
  bountyId?: unknown;
  videoPath?: unknown;
  socialPostUrl?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = getTwitterUserIdFromSession(session);
  const userHandle = getTwitterHandleFromSession(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Sign in with X first" }, { status: 401 });
  }

  const limit = checkRateLimit(`bounty-submit:${userId}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const ipLimit = checkRateLimit(
    `bounty-submit:ip:${clientIp(request)}`,
    10,
    60_000,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bountyId = typeof body.bountyId === "string" ? body.bountyId : "";
  const videoPath = typeof body.videoPath === "string" ? body.videoPath : "";
  const socialPostUrl = parseSocialPostUrl(body.socialPostUrl);

  if (!bountyId) {
    return NextResponse.json({ error: "bountyId is required" }, { status: 400 });
  }
  // Uploaded videos live at {bountyId}/{userId}.{ext} — reject foreign paths.
  if (!videoPath.startsWith(`${bountyId}/${userId}.`)) {
    return NextResponse.json(
      { error: "videoPath does not match an upload for your account" },
      { status: 400 },
    );
  }
  if (!socialPostUrl) {
    return NextResponse.json(
      { error: "socialPostUrl must be a public https link to your social post" },
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
        { error: "The submission window for this bounty has closed" },
        { status: 403 },
      );
    }

    const submission = await upsertSubmission({
      bountyId,
      userId,
      userHandle: userHandle ? `@${userHandle}` : userId,
      videoPath,
      socialPostUrl,
    });

    return NextResponse.json({ id: submission.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
