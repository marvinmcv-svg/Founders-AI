import * as repo from "@founders/core/repo";

/** Health check for uptime monitors and the load balancer: 200 when nothing is in outage, else 503. */
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await repo.systemStatus().catch(() => ({ overall: "outage" as const, components: [], checkedAt: new Date().toISOString() }));
  return Response.json(
    { status: s.overall, components: Object.fromEntries(s.components.map((c) => [c.id, c.state])), checked_at: s.checkedAt, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" },
    { status: s.overall === "outage" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
