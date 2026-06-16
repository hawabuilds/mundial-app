import { readPublicPayoutConfig } from "@/lib/payoutContract";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public payout contract + chain (same source as voucher signing). */
export async function GET() {
  const config = readPublicPayoutConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Payout contract is not configured on the server" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    contractAddress: config.contractAddress,
    chainId: config.chainId.toString(),
  });
}
