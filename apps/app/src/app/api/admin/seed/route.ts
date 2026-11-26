import { timingSafeEqual } from "node:crypto";
import { getSql } from "@founders/db";

/**
 * Loads the synthetic seed into the configured DATABASE_URL from inside the deployment
 * (hosted DBs are often unreachable from developer machines). Disabled unless SEED_TOKEN is set.
 * POST /api/admin/seed  with header  Authorization: Bearer <SEED_TOKEN>   (?scale=0.2)
 */
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request) {
  const token = process.env.SEED_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || token.length < 24) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Not found", { status: 404 });
  const [r] = await getSql()`SELECT current_user, version(), (SELECT count(*) FROM companies)::int AS companies`;
  return Response.json(r);
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Not found", { status: 404 });
  const scale = Math.min(1, Math.max(0.01, Number(new URL(req.url).searchParams.get("scale") ?? "0.2")));
  const { seedDatabase } = await import("@founders/seed/load");
  const lines: string[] = [];
  const stats = await seedDatabase(getSql(), { scale, log: (l) => lines.push(l) });
  return Response.json({ ok: true, scale, stats, log: lines });
}
