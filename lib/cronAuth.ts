import type { NextRequest } from "next/server";

function readSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function isCollectAuthorized(request: NextRequest): boolean {
  const secret = readSecret(process.env.COLLECT_SECRET);
  if (!secret) return false;

  const headerSecret = request.headers.get("x-collect-secret")?.trim();
  if (headerSecret === secret) return true;

  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  return querySecret === secret;
}

/** Vercel Cron sends Authorization: Bearer <CRON_SECRET>. COLLECT_SECRET works for manual tests. */
export function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = readSecret(process.env.CRON_SECRET);
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")?.trim();
    if (authHeader === `Bearer ${cronSecret}`) return true;
  }

  // Vercel cron invocations include this header; still require CRON_SECRET or COLLECT_SECRET.
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron === "1" && cronSecret) {
    const authHeader = request.headers.get("authorization")?.trim();
    if (authHeader === `Bearer ${cronSecret}`) return true;
  }

  return isCollectAuthorized(request);
}
