/**
 * Chrome extension helpers (plan 13.3) that the public API does not cover: remote config (LinkedIn
 * panel flag, CRM target), Like, and Push to CRM. Authenticated with the user's API key; everything is
 * org-scoped through the repo. Lookups and lists go through the public API (`/api/v1`) itself.
 */
import * as repo from "@founders/core/repo";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function principal(req: Request): Promise<repo.OrgContext | null> {
  const key = req.headers.get("x-api-key");
  const p = key ? await repo.verifyApiKey(key.trim()) : null;
  return p ? { orgId: p.orgId, userId: p.userId, role: "member" } : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const ctx = await principal(req);
  if (!ctx) return json({ error: "Invalid, pending or revoked API key" }, 401);
  if (action !== "config") return json({ error: "Not found" }, 404);
  const [linkedinPanel, crm, org] = await Promise.all([repo.isFlagOn("extension_linkedin_panel", ctx.orgId), repo.defaultCrm(ctx), repo.getOrg(ctx)]);
  return json({ org: { id: ctx.orgId, name: org?.name ?? null }, linkedinPanel, crm });
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const ctx = await principal(req);
  if (!ctx) return json({ error: "Invalid, pending or revoked API key" }, 401);
  let body: { entityType?: string; kind?: string; id?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Expected a JSON body" }, 400);
  }
  const id = String(body.id ?? "");
  if (!/^(com|per|inv)_[A-Za-z0-9]{6,40}$/.test(id)) return json({ error: "Expected a company, person or investor id" }, 400);
  const entityType = id.startsWith("com_") ? "COMPANY" : id.startsWith("per_") ? "PERSON" : "INVESTOR";
  try {
    if (action === "like") return json({ liked: await repo.toggleLike(ctx, entityType, id) });
    if (action === "push") {
      if (entityType === "INVESTOR") return json({ error: "Only companies and people can be pushed to a CRM" }, 400);
      const target = await repo.defaultCrm(ctx);
      if (!target) return json({ error: "No CRM connected — connect one in Settings → CRM" }, 409);
      const r = await repo.pushToCrm(ctx, target, entityType, [id], "extension");
      if (r.status === "FAILED") return json({ error: r.error ?? "Push failed" }, 502);
      return json({ crm: target, created: r.counts.created ?? 0, updated: r.counts.updated ?? 0 });
    }
  } catch (e) {
    if (e instanceof repo.ForbiddenError) return json({ error: e.message }, 403);
    if (e instanceof repo.NotFoundError) return json({ error: e.message }, 404);
    throw e;
  }
  return json({ error: "Not found" }, 404);
}
