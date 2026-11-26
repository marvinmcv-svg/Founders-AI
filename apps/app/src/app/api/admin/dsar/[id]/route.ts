import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

/** Admin console: download a completed ACCESS export to send by hand when e-mail is not configured. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!repo.isPlatformAdmin(ctx.email)) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const d = await repo.getDsar({ email: ctx.email, userId: ctx.userId }, id).catch(() => null);
  if (!d || d.type !== "ACCESS" || d.status !== "COMPLETED") return new Response("Not found", { status: 404 });
  await repo.recordAudit({ orgId: repo.PLATFORM_ORG, actor: ctx.email, actorType: "platform_admin", action: "dsar.export.download", target: id });
  return new Response(JSON.stringify(d.result, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="data-request-${id}.json"`, "Cache-Control": "no-store" },
  });
}
