import { auth } from "@/auth";
import { getPayoutEpoch } from "@/app/lib/payoutEpochs";
import { recordSolanaClaim } from "@/app/lib/supabase";
import { parseEpochId } from "@/lib/epochId";
import { fetchConfirmedClaimTx } from "@/lib/solanaClaimRecord";
import { readSolanaPayoutConfig } from "@/lib/solanaPayoutConfig";
import { resolveSnapshotWinner } from "@/lib/resolveSnapshotWinner";
import {
  getTwitterHandleFromSession,
  getTwitterUserIdFromSession,
} from "@/lib/twitterUserId";
import { Connection } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RecordClaimBody = {
  epochId?: unknown;
  txSignature?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RecordClaimBody;
  try {
    body = (await request.json()) as RecordClaimBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const epochId = parseEpochId(body.epochId);
  if (!epochId) {
    return NextResponse.json({ error: "epochId required" }, { status: 400 });
  }

  const txSignature =
    typeof body.txSignature === "string" ? body.txSignature.trim() : "";
  if (!txSignature) {
    return NextResponse.json({ error: "txSignature required" }, { status: 400 });
  }

  try {
    const config = readSolanaPayoutConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    const parsed = await fetchConfirmedClaimTx(
      connection,
      txSignature,
      config.programId,
    );

    if (parsed.epochId !== epochId) {
      return NextResponse.json(
        { error: "Transaction epoch does not match request" },
        { status: 400 },
      );
    }

    const epoch = await getPayoutEpoch(epochId);
    if (!epoch?.finalized_at) {
      return NextResponse.json({ error: "Epoch not finalized" }, { status: 403 });
    }

    const snapshot = await resolveSnapshotWinner(epochId, session);
    if (!snapshot) {
      return NextResponse.json(
        { error: "You are not a winner for this epoch" },
        { status: 403 },
      );
    }

    const userId =
      getTwitterUserIdFromSession(session) ?? snapshot.user_id;
    const userHandle =
      getTwitterHandleFromSession(session) ??
      snapshot.user_handle ??
      userId;

    const confirmedAt =
      parsed.blockTime?.toISOString() ?? new Date().toISOString();

    const { inserted } = await recordSolanaClaim({
      epoch_id: Number(epochId),
      user_id: userId,
      user_handle: userHandle,
      recipient_token_account: parsed.recipientTokenAccount,
      amount_base_units: Number(parsed.amountBaseUnits),
      tx_signature: txSignature,
      confirmed_at: confirmedAt,
    });

    return NextResponse.json({ ok: true, inserted });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record claim";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
