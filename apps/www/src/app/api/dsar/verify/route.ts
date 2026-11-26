import { NextResponse } from "next/server";
import { allow, ipOf } from "@/lib/ratelimit";

/** E-mail verification link for a privacy request; lands back on the privacy-rights page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/privacy-rights", url.origin);
  if (!allow(`dsar-verify:${ipOf(req)}`, 10)) {
    back.searchParams.set("verified", "0");
    return NextResponse.redirect(back);
  }
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const { verifyDsar } = await import("@founders/core/repo");
  const ok = /^dsr_[A-Za-z0-9]+$/.test(id) && token.length > 10 && (await verifyDsar(id, token));
  back.searchParams.set("verified", ok ? "1" : "0");
  return NextResponse.redirect(back);
}
