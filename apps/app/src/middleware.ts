import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// /oauth/consent handles its own login redirect so the signed OAuth query survives it.
const PUBLIC = [/^\/mcp(\/|$)/, /^\/oauth\//,/^\/\.well-known\//, /^\/login/, /^\/signup/, /^\/api\/auth/, /^\/api\/v1/, /^\/api\/admin\//, /^\/api\/cron\//, /^\/developers/, /^\/_next/, /^\/founders-mark\.jpg$/, /^\/favicon/];

/** Cheap cookie check; the real session is verified server-side in getCtx(). */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
