import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, ipOf } from "@/lib/ratelimit";

const schema = z.object({
  type: z.enum(["ACCESS", "DELETE", "OPT_OUT"]),
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  details: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  if (!allow(`dsar:${ipOf(req)}`, 3)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { insertDsar } = await import("@founders/core/repo");
  const id = await insertDsar(parsed.data);
  return NextResponse.json({ ok: true, id });
}
