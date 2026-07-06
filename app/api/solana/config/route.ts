import {
  readServerSolanaCluster,
  SOLANA_NETWORK_LABEL,
} from "@/lib/solanaPublicConfig";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public Solana cluster for wallet UI — devnet only. */
export async function GET() {
  return NextResponse.json({
    cluster: readServerSolanaCluster(),
    label: SOLANA_NETWORK_LABEL,
  });
}
