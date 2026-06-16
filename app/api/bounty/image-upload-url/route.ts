import { auth } from "@/auth";
import { createImageUploadUrl } from "@/app/lib/bounties";
import { isAdminSession } from "@/lib/adminAuth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

type ImageUploadUrlBody = {
  fileName?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json(
      { error: "Only the project admin can upload bounty images" },
      { status: 403 },
    );
  }

  const ipLimit = checkRateLimit(
    `bounty-image:ip:${clientIp(request)}`,
    20,
    60_000,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: ImageUploadUrlBody;
  try {
    body = (await request.json()) as ImageUploadUrlBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "Image must be .jpg, .png, .webp or .gif" },
      { status: 400 },
    );
  }

  try {
    const path = `covers/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const upload = await createImageUploadUrl(path);

    return NextResponse.json({
      path: upload.path,
      token: upload.token,
      signedUrl: upload.signedUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
