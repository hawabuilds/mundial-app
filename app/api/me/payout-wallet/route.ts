import { auth } from "@/auth";
import { resolveWalletUserId } from "@/app/lib/resolveCanonicalUserId";
import { getUserWallet } from "@/app/lib/userWallets";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = await resolveWalletUserId(session);
    if (!userId) {
      return NextResponse.json({ linkedWallet: null, updatedAt: null });
    }

    const row = await getUserWallet(userId);
    return NextResponse.json({
      linkedWallet: row?.wallet_address ?? null,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load payout wallet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
