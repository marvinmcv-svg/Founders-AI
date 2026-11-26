import { NextResponse } from "next/server";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

/**
 * Polled by the chat while a turn runs (server actions are queued per client, so progress can't be
 * read through them). Session-authenticated and org-scoped like every other read.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const { id } = await params;
  try {
    const [thread, messages] = await Promise.all([repo.getThread(ctx, id), repo.getMessages(ctx, id)]);
    const artifacts = await repo.getArtifacts(ctx, messages.flatMap((m) => m.artifact_ids ?? []));
    return NextResponse.json({
      thread: { id: thread.id, title: thread.title, visibility: thread.visibility, owner_id: thread.owner_id, mine: thread.owner_id === ctx.userId },
      messages: messages.map(({ transcript: _t, ...m }) => m),
      artifacts: artifacts.map((a) => ({ id: a.id, kind: a.kind, title: a.title })),
    });
  } catch (e) {
    if (e instanceof repo.NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
}
