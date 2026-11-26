import "server-only";
import { headers } from "next/headers";

/** Client IP and user agent for audit entries (first hop of x-forwarded-for, as set by Vercel). */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}
