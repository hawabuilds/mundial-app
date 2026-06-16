import { auth } from "@/auth";
import { getPayoutEpoch, parsePotWei } from "@/app/lib/payoutEpochs";
import { getUserWallet } from "@/app/lib/userWallets";
import { parseEpochId } from "@/lib/epochId";
import { payoutAmountWei, isTopTwentyRank } from "@/lib/payoutTiers";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { resolveSnapshotWinner } from "@/lib/resolveSnapshotWinner";
import {
  getTwitterHandleFromSession,
  getTwitterUserIdFromSession,
} from "@/lib/twitterUserId";
import { parseSolanaAddress } from "@/lib/solanaAddress";
import {
  diagnoseSolanaPayoutConfig,
  readSolanaPayoutConfig,
} from "@/lib/solanaPayoutConfig";
import { getSolanaClaimAccounts } from "@/lib/solanaClaimMarker";
import {
  computeSolanaVoucherId,
  diagnoseSolanaSignerEnv,
  signSolanaClaimVoucher,
} from "@/lib/solanaPayoutVoucher";
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

type SolanaClaimVoucherBody = {
  epochId?: unknown;
  owner?: unknown;
  recipientToken?: unknown;
};

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitUserKey =
    getTwitterUserIdFromSession(session) ??
    getTwitterHandleFromSession(session) ??
    "unknown";

  const ipLimit = checkRateLimit(
    `solana-claim-voucher:ip:${clientIp(request)}`,
    RATE_LIMIT * 2,
    RATE_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  const userLimit = checkRateLimit(
    `solana-claim-voucher:user:${rateLimitUserKey}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Too many voucher requests" },
      { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } },
    );
  }

  const configError =
    diagnoseSolanaPayoutConfig() ?? diagnoseSolanaSignerEnv();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  const config = readSolanaPayoutConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Solana payout is not configured" },
      { status: 503 },
    );
  }

  let body: SolanaClaimVoucherBody;
  try {
    body = (await request.json()) as SolanaClaimVoucherBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const epochId = parseEpochId(body.epochId);
  if (!epochId) {
    return NextResponse.json(
      { error: "epochId must be a positive integer (e.g. 20260613)" },
      { status: 400 },
    );
  }

  const owner = parseSolanaAddress(body.owner);
  if (!owner) {
    return NextResponse.json(
      { error: "owner must be a valid Solana wallet address" },
      { status: 400 },
    );
  }

  const recipientTokenRaw = parseSolanaAddress(body.recipientToken);
  if (!recipientTokenRaw) {
    return NextResponse.json(
      { error: "recipientToken must be a valid USDC token account" },
      { status: 400 },
    );
  }

  let recipientToken: PublicKey;
  try {
    recipientToken = new PublicKey(recipientTokenRaw);
  } catch {
    return NextResponse.json(
      { error: "recipientToken must be a valid Solana public key" },
      { status: 400 },
    );
  }

  try {
    const epoch = await getPayoutEpoch(epochId);
    if (!epoch?.finalized_at) {
      return NextResponse.json(
        { error: "Epoch is not finalized yet" },
        { status: 403 },
      );
    }

    const potWei = parsePotWei(epoch.pot_wei);
    if (!potWei) {
      return NextResponse.json(
        { error: "Epoch pot is not configured" },
        { status: 503 },
      );
    }

    const snapshot = await resolveSnapshotWinner(epochId, session);
    if (!snapshot || !isTopTwentyRank(snapshot.rank)) {
      return NextResponse.json(
        { error: "You are not a top-20 winner for this epoch" },
        { status: 403 },
      );
    }

    const linked = await getUserWallet(snapshot.user_id);
    if (!linked) {
      return NextResponse.json(
        { error: "Link a payout wallet before requesting a voucher" },
        { status: 403 },
      );
    }

    if (linked.wallet_address !== owner) {
      return NextResponse.json(
        {
          error: `This wallet does not match your linked payout address (${linked.wallet_address}). Reconnect the linked wallet on the Vault tab.`,
        },
        { status: 403 },
      );
    }

    const amount = payoutAmountWei(potWei, snapshot.rank);
    if (!amount || amount <= 0n) {
      return NextResponse.json(
        { error: "Could not derive payout amount for your rank" },
        { status: 403 },
      );
    }

    const voucherId = computeSolanaVoucherId(epochId, snapshot.user_id);
    const signed = signSolanaClaimVoucher({
      epochId,
      amount,
      recipientToken,
      userId: snapshot.user_id,
      config,
    });

    const accounts = getSolanaClaimAccounts(
      config.programId,
      epochId,
      voucherId,
    );

    const programDeployed =
      config.programId.toBase58() !==
      "11111111111111111111111111111111";

    return NextResponse.json({
      epochId: epochId.toString(),
      amount: amount.toString(),
      rank: snapshot.rank,
      owner,
      recipientToken: recipientToken.toBase58(),
      voucherId: bytesToHex(voucherId),
      messageHash: bytesToHex(signed.messageHash),
      signature: bytesToHex(signed.signature),
      signerPublicKey: signed.signerPublicKey.toBase58(),
      programId: config.programId.toBase58(),
      usdcMint: config.usdcMint.toBase58(),
      rpcUrl: config.rpcUrl,
      cluster: config.cluster,
      programDeployed,
      accounts: {
        config: accounts.config.toBase58(),
        vault: accounts.vault.toBase58(),
        epoch: accounts.epoch.toBase58(),
        claimMarker: accounts.claimMarker.toBase58(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sign Solana voucher";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
