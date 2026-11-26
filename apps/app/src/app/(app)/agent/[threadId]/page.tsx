import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as repo from "@founders/core/repo";
import { AgentChat } from "@/components/agent/AgentChat";
import { composerOptions } from "@/lib/agent";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Agent" };

export default async function Thread({ params }: { params: Promise<{ threadId: string }> }) {
  const ctx = await getCtx();
  const { threadId } = await params;
  let thread: repo.ThreadRow;
  try {
    thread = await repo.getThread(ctx, threadId);
  } catch (e) {
    if (e instanceof repo.NotFoundError) notFound();
    throw e;
  }
  const [messages, opts] = await Promise.all([repo.getMessages(ctx, threadId), composerOptions(ctx)]);
  const artifacts = await repo.getArtifacts(ctx, messages.flatMap((m) => m.artifact_ids ?? []));
  return (
    <AgentChat
      key={threadId}
      thread={{ id: thread.id, title: thread.title, visibility: thread.visibility, mine: thread.owner_id === ctx.userId }}
      messages={messages.map(({ transcript: _t, ...m }) => m)}
      artifacts={artifacts.map((a) => ({ id: a.id, kind: a.kind, title: a.title }))}
      {...opts}
      contextEntityId={typeof thread.context?.entityId === "string" ? thread.context.entityId : null}
    />
  );
}
