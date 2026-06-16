import { auth } from "@/auth";
import {
  clearBountyClaimLock,
  getBounty,
  getSubmission,
  markBountyPaid,
  tryStartBountyClaim,
} from "@/app/lib/bounties";
import { getUserWallet } from "@/app/lib/userWallets";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import {
  diagnoseBountyPayoutEnv,
  sendBountyPayout,
} from "@/lib/sendBountyPayout";
import { getTwitterUserIdFromSession } from "@/lib/twitterUserId";
import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";

export const dynamic = "force-dynamic";

type ClaimBody = {
  bountyId?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = getTwitterUserIdFromSession(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Sign in with X first" }, { status: 401 });
  }

  const limit = checkRateLimit(`bounty-claim:${userId}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const ipLimit = checkRateLimit(
    `bounty-claim:ip:${clientIp(request)}`,
    10,
    60_000,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const envIssue = diagnoseBountyPayoutEnv();
  if (envIssue) {
    return NextResponse.json({ error: envIssue }, { status: 503 });
  }

  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bountyId = typeof body.bountyId === "string" ? body.bountyId : "";
  if (!bountyId) {
    return NextResponse.json({ error: "bountyId is required" }, { status: 400 });
  }

  try {
    const bounty = await getBounty(bountyId);
    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (!bounty.winner_submission_id) {
      return NextResponse.json(
        { error: "No winner has been selected yet" },
        { status: 403 },
      );
    }
    if (bounty.paid_tx_hash) {
      return NextResponse.json({
        alreadyClaimed: true,
        txHash: bounty.paid_tx_hash,
      });
    }

    const winner = await getSubmission(bounty.winner_submission_id);
    if (!winner || winner.user_id !== userId) {
      return NextResponse.json(
        { error: "Only the winning submission's author can claim this bounty" },
        { status: 403 },
      );
    }

    const linked = await getUserWallet(userId);
    if (!linked) {
      return NextResponse.json(
        {
          error:
            "Link a payout wallet first — open the app's Wallet tab, connect MetaMask, then come back and claim",
        },
        { status: 403 },
      );
    }

    const amountWei = BigInt(bounty.reward_wei);
    if (amountWei <= 0n) {
      return NextResponse.json(
        { error: "Bounty reward is not configured" },
        { status: 503 },
      );
    }

    const lockAcquired = await tryStartBountyClaim(bountyId);
    if (!lockAcquired) {
      return NextResponse.json(
        { error: "A claim is already being processed — try again in a minute" },
        { status: 409 },
      );
    }

    try {
      const txHash = await sendBountyPayout({
        to: linked.wallet_address as Address,
        amountWei,
      });
      await markBountyPaid(bountyId, txHash);
      return NextResponse.json({ txHash });
    } catch (error) {
      await clearBountyClaimLock(bountyId).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to claim bounty";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
