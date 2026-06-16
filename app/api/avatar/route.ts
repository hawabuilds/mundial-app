import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "pbs.twimg.com",
  "abs.twimg.com",
  "pbs.x.com",
  "abs-0.twimg.com",
]);

const IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  "Access-Control-Allow-Origin": "*",
} as const;

function isAllowedAvatarHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return host === "twimg.com" || host.endsWith(".twimg.com");
}

async function proxyImage(target: string): Promise<NextResponse> {
  const upstream = await fetch(target, {
    headers: { "User-Agent": "mundial/1.0" },
    next: { revalidate: 3600 },
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 400 });
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...IMAGE_HEADERS,
    },
  });
}

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim();
  if (username) {
    const handle = username.replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }
    try {
      return await proxyImage(
        `https://unavatar.io/twitter/${encodeURIComponent(handle)}`,
      );
    } catch {
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }
  }

  const urlParam = request.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url or username" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !isAllowedAvatarHost(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    return await proxyImage(target.toString());
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
