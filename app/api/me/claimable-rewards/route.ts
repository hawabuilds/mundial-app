import { auth } from "@/auth";

import { listUserClaimableRewards } from "@/app/lib/listUserClaimableRewards";

import { NextResponse } from "next/server";



export const dynamic = "force-dynamic";
export const maxDuration = 30;



export async function GET() {

  const session = await auth();



  if (!session?.user) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  try {

    const rewards = await listUserClaimableRewards(session);

    return NextResponse.json({ rewards });

  } catch (error) {

    const message =

      error instanceof Error ? error.message : "Failed to load claimable rewards";

    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;

    return NextResponse.json({ error: message }, { status });

  }

}

