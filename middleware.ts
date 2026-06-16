import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COPA_APEX = "copamundial.app";
const COPA_ORIGIN = `https://${COPA_APEX}`;

function hostname(request: NextRequest): string {
  return (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
}

function isCopaHost(request: NextRequest): boolean {
  const host = hostname(request);
  return host === COPA_APEX || host === `www.${COPA_APEX}`;
}

/** Old Vercel URLs for this project — send everything to copamundial.app. */
function isLegacyMundialVercelHost(host: string): boolean {
  const h = host.split(":")[0]!.toLowerCase();
  return h.endsWith(".vercel.app") && h.startsWith("mundial");
}

function copaPathFromLegacy(pathname: string): string {
  if (pathname === "/mundial") return "/";
  if (pathname.startsWith("/mundial/")) {
    return pathname.replace(/^\/mundial/, "") || "/";
  }
  return pathname;
}

function isPassthroughPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

/** Let OAuth callbacks finish on the host X redirects to; send users elsewhere to copa. */
function isAuthCallbackPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth/");
}

export function middleware(request: NextRequest) {
  const host = hostname(request);

  if (isLegacyMundialVercelHost(host)) {
    const { pathname, search } = request.nextUrl;
    if (isAuthCallbackPath(pathname)) {
      return NextResponse.next();
    }
    const target = new URL(copaPathFromLegacy(pathname) + search, COPA_ORIGIN);
    return NextResponse.redirect(target, 308);
  }

  if (!isCopaHost(request)) {
    return NextResponse.next();
  }

  if (host === `www.${COPA_APEX}`) {
    const url = request.nextUrl.clone();
    url.host = COPA_APEX;
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;

  if (isPassthroughPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/mundial" || pathname.startsWith("/mundial/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/mundial/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/mundial";
    return NextResponse.rewrite(url);
  }

  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    const url = request.nextUrl.clone();
    const sub = pathname === "/docs" ? "" : pathname.slice("/docs".length);
    url.pathname = `/mundial/docs${sub}`;
    return NextResponse.rewrite(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
