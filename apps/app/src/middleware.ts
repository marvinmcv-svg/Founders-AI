import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC = [/^\/login/, /^\/signup/, /^\/api\/auth/, /^\/api\/v1/, /^\/developers/, /^\/_next/, /^\/founders-mark\.jpg$/, /^\/favicon/];

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
