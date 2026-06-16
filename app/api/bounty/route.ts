import { auth } from "@/auth";
import {
  bountyImagePublicUrl,
  bountyVideoPublicUrl,
  createBounty,
  listBounties,
  listSubmissions,
  type BountyRow,
  type BountySubmissionRow,
} from "@/app/lib/bounties";
import { isAdminSession } from "@/lib/adminAuth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import {
  getTwitterHandleFromSession,
  getTwitterUserIdFromSession,
} from "@/lib/twitterUserId";
import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";

export const dynamic = "force-dynamic";

const MAX_REWARD_BNB = 100;
const MAX_DEADLINE_DAYS = 90;

type PublicSubmission = {
  id: string;
  userHandle: string;
  videoUrl: string;
  socialPostUrl: string;
  createdAt: string;
  isWinner: boolean;
  isMine: boolean;
};

type PublicBounty = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  rewardWei: string;
  deadlineAt: string;
  winnerSelectedAt: string | null;
  paidTxHash: string | null;
  submissions: PublicSubmission[];
  myCanClaim: boolean;
};

function toPublicBounty(
  bounty: BountyRow,
  submissions: BountySubmissionRow[],
  viewerUserId: string | null,
): PublicBounty {
  const winnerSubmission = submissions.find(
    (submission) => submission.id === bounty.winner_submission_id,
  );

  return {
    id: bounty.id,
    title: bounty.title,
    description: bounty.description,
    imageUrl: bounty.image_path ? bountyImagePublicUrl(bounty.image_path) : null,
    rewardWei: bounty.reward_wei,
    deadlineAt: bounty.deadline_at,
    winnerSelectedAt: bounty.winner_selected_at,
    paidTxHash: bounty.paid_tx_hash,
    submissions: submissions.map((submission) => ({
      id: submission.id,
      userHandle: submission.user_handle,
      videoUrl: bountyVideoPublicUrl(submission.video_path),
      socialPostUrl: submission.social_post_url,
      createdAt: submission.created_at,
      isWinner: submission.id === bounty.winner_submission_id,
      isMine: viewerUserId !== null && submission.user_id === viewerUserId,
    })),
    myCanClaim:
      viewerUserId !== null &&
      winnerSubmission?.user_id === viewerUserId &&
      !bounty.paid_tx_hash,
  };
}

export async function GET() {
  try {
    const session = await auth();
    const viewerUserId = getTwitterUserIdFromSession(session);

    const [bounties, submissions] = await Promise.all([
      listBounties(),
      listSubmissions(),
    ]);

    const byBounty = new Map<string, BountySubmissionRow[]>();
    for (const submission of submissions) {
      const list = byBounty.get(submission.bounty_id) ?? [];
      list.push(submission);
      byBounty.set(submission.bounty_id, list);
    }

    return NextResponse.json({
      isAdmin: isAdminSession(session),
      bounties: bounties.map((bounty) =>
        toPublicBounty(bounty, byBounty.get(bounty.id) ?? [], viewerUserId),
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load bounties";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateBountyBody = {
  title?: unknown;
  description?: unknown;
  imagePath?: unknown;
  rewardBnb?: unknown;
  deadlineAt?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json(
      { error: "Only the project admin can post bounties" },
      { status: 403 },
    );
  }

  const ipLimit = checkRateLimit(
    `bounty-create:ip:${clientIp(request)}`,
    10,
    60_000,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: CreateBountyBody;
  try {
    body = (await request.json()) as CreateBountyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!title || title.length > 120) {
    return NextResponse.json(
      { error: "title is required (max 120 chars)" },
      { status: 400 },
    );
  }
  if (!description || description.length > 2000) {
    return NextResponse.json(
      { error: "description is required (max 2000 chars)" },
      { status: 400 },
    );
  }

  const imagePath =
    typeof body.imagePath === "string" ? body.imagePath.trim() : "";
  if (
    !imagePath ||
    !imagePath.startsWith("covers/") ||
    imagePath.includes("..") ||
    imagePath.length > 200
  ) {
    return NextResponse.json(
      { error: "A cover image is required" },
      { status: 400 },
    );
  }

  const rewardBnb = Number(body.rewardBnb);
  if (!Number.isFinite(rewardBnb) || rewardBnb <= 0 || rewardBnb > MAX_REWARD_BNB) {
    return NextResponse.json(
      { error: `rewardBnb must be between 0 and ${MAX_REWARD_BNB}` },
      { status: 400 },
    );
  }

  const deadlineAt =
    typeof body.deadlineAt === "string" ? new Date(body.deadlineAt) : null;
  if (!deadlineAt || Number.isNaN(deadlineAt.getTime())) {
    return NextResponse.json(
      { error: "deadlineAt must be an ISO datetime" },
      { status: 400 },
    );
  }
  const maxDeadline = Date.now() + MAX_DEADLINE_DAYS * 86_400_000;
  if (deadlineAt.getTime() <= Date.now() || deadlineAt.getTime() > maxDeadline) {
    return NextResponse.json(
      { error: `deadlineAt must be in the future (max ${MAX_DEADLINE_DAYS} days)` },
      { status: 400 },
    );
  }

  try {
    const createdBy =
      getTwitterUserIdFromSession(session) ??
      getTwitterHandleFromSession(session) ??
      "admin";

    const bounty = await createBounty({
      title,
      description,
      imagePath,
      rewardWei: parseEther(String(rewardBnb)),
      deadlineAt,
      createdBy,
    });

    return NextResponse.json({ id: bounty.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create bounty";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
