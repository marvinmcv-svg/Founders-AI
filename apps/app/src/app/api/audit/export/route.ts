import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

/** Settings → Audit log → Export CSV (workspace admins). The export itself is audited. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  const u = new URL(req.url);
  const f = { action: u.searchParams.get("action") ?? undefined, actor: u.searchParams.get("actor") ?? undefined, from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined };
  let csv: string;
  try {
    csv = await repo.auditCsv(ctx, f);
  } catch (e) {
    if (e instanceof repo.ForbiddenError) return new Response(e.message, { status: 403 });
    throw e;
  }
  await repo.audit(ctx, "audit.export", undefined, f);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
