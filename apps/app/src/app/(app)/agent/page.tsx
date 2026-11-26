import type { Metadata } from "next";
import { AgentChat } from "@/components/agent/AgentChat";
import { composerOptions } from "@/lib/agent";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Agent" };

/** New chat. `?entity=com_…&name=…` (from "Ask agent" on a profile) pre-fills an @mention and page context. */
export default async function NewChat({ searchParams }: { searchParams: Promise<{ entity?: string; name?: string; q?: string }> }) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const opts = await composerOptions(ctx);
  const entity = sp.entity && /^(com|per|inv)_[a-z0-9]{6,40}$/.test(sp.entity) ? sp.entity : null;
  const name = (sp.name ?? "").replace(/[[\]()]/g, "").slice(0, 100);
  const initialText = entity && name ? `@[${name}](${entity}) ` : (sp.q ?? "").slice(0, 500);
  return <AgentChat thread={null} messages={[]} artifacts={[]} {...opts} initialText={initialText} contextEntityId={entity} />;
}
