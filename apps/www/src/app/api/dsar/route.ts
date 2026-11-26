import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, ipOf } from "@/lib/ratelimit";

const schema = z.object({
  type: z.enum(["ACCESS", "DELETE", "OPT_OUT"]),
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || /linkedin\.com\/in\//i.test(v), "Not a LinkedIn profile URL")
    .optional(),
  details: z.string().trim().max(2000).optional(),
});

/** Public privacy-rights form (plan 14.5): stores the request and e-mails a verification link. */
export async function POST(req: Request) {
  if (!allow(`dsar:${ipOf(req)}`, 3)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { submitDsar } = await import("@founders/core/repo");
  const verifyUrl = new URL("/api/dsar/verify", new URL(req.url).origin).toString();
  const { id } = await submitDsar({ ...parsed.data, linkedinUrl: parsed.data.linkedinUrl || undefined }, verifyUrl);
  return NextResponse.json({ ok: true, id });
}
