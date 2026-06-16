import { auth } from "@/auth";
import {
  getBounty,
  getSubmission,
  setBountyWinner,
} from "@/app/lib/bounties";
import { isAdminSession } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SelectWinnerBody = {
  bountyId?: unknown;
  submissionId?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json(
      { error: "Only the project admin can select a winner" },
      { status: 403 },
    );
  }

  let body: SelectWinnerBody;
  try {
    body = (await request.json()) as SelectWinnerBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bountyId = typeof body.bountyId === "string" ? body.bountyId : "";
  const submissionId =
    typeof body.submissionId === "string" ? body.submissionId : "";
  if (!bountyId || !submissionId) {
    return NextResponse.json(
      { error: "bountyId and submissionId are required" },
      { status: 400 },
    );
  }

  try {
    const bounty = await getBounty(bountyId);
    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (new Date(bounty.deadline_at).getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Wait for the submission deadline before selecting a winner" },
        { status: 403 },
      );
    }
    if (bounty.paid_tx_hash) {
      return NextResponse.json(
        { error: "This bounty has already been paid out" },
        { status: 403 },
      );
    }

    const submission = await getSubmission(submissionId);
    if (!submission || submission.bounty_id !== bountyId) {
      return NextResponse.json(
        { error: "Submission not found for this bounty" },
        { status: 404 },
      );
    }

    await setBountyWinner(bountyId, submissionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to select winner";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
