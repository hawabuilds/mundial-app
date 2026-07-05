import { NextRequest, NextResponse } from "next/server";
import { readServerSolanaRpcUrl } from "@/lib/solanaPublicConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Same-origin proxy for Solana JSON-RPC (devnet only).
 * The public devnet endpoint frequently returns 403 to browser origins; routing
 * through the server avoids CORS/origin blocking and lets us swap in a premium
 * RPC via SOLANA_RPC_URL without exposing it to the client.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();

  try {
    const upstream = await fetch(readServerSolanaRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Solana RPC proxy failed";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: null },
      { status: 502 },
    );
  }
}
