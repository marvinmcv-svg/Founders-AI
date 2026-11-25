import { NextResponse } from "next/server";
import { z } from "zod";
import { FREE_MAIL } from "@/lib/freemail";
import { allow, ipOf } from "@/lib/ratelimit";

const demo = z.object({
  kind: z.literal("DEMO"),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  firmType: z.string().trim().min(1).max(80),
  aum: z.string().trim().min(1).max(40),
  phone: z.string().trim().max(40).optional(),
  website: z.string().optional(),
});
const partner = z.object({
  kind: z.literal("PARTNER"),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  partnershipType: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(4000),
  website: z.string().optional(),
});

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // BLOCKED-HUMAN H3: keys not configured yet
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const d = (await r.json()) as { success?: boolean };
  return Boolean(d.success);
}

export async function POST(req: Request) {
  const ip = ipOf(req);
  if (!allow(`lead:${ip}`)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = z.discriminatedUnion("kind", [demo, partner]).safeParse(body);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
    return NextResponse.json({ error: "Invalid input", fieldErrors }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // honeypot: silently drop bots
  if (!(await verifyTurnstile(typeof body?.turnstileToken === "string" ? body.turnstileToken : undefined, ip)))
    return NextResponse.json({ error: "Bot check failed" }, { status: 400 });
  const domain = d.email.split("@")[1]?.toLowerCase() ?? "";
  if (d.kind === "DEMO" && FREE_MAIL.includes(domain)) return NextResponse.json({ error: "Work email required", fieldErrors: { email: "Please use your work email." } }, { status: 400 });
  const { insertLead } = await import("@founders/core/repo");
  // Mock CRM sink until HubSpot is connected (H3): leads table + routing.
  const lead = await insertLead({ ...d, locale: req.headers.get("accept-language")?.split(",")[0] });
  return NextResponse.json({ ok: true, route: lead.route });
}
