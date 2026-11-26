import type { Metadata } from "next";
import * as repo from "@founders/core/repo";
import { PersonalizationClient } from "@/components/agent/PersonalizationClient";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Agent personalization" };

/** Plan 10.1 Context: agent instructions per user, with workspace defaults; seeded from the onboarding thesis. */
export default async function Personalization() {
  const ctx = await getCtx();
  const [{ user, workspace }, org] = await Promise.all([repo.getAgentInstructions(ctx), repo.getOrg(ctx)]);
  const thesis = (org?.thesis ?? {}) as { role?: string; sectors?: string[]; stages?: string[]; geographies?: string[] };
  const seededUser: repo.AgentInstructions = Object.keys(user).length ? user : { role: thesis.role, sectors: thesis.sectors, stages: thesis.stages, geographies: thesis.geographies };
  return (
    <div className="mx-auto max-w-[760px] p-6">
      <h1 className="text-[22px] font-semibold">Agent personalization</h1>
      <p className="mb-5 text-[13px] text-muted">The agent reads these on every message: who you are, what you invest in, and how you like answers. Your settings override the workspace defaults.</p>
      <PersonalizationClient user={seededUser} workspace={workspace} isAdmin={ctx.role === "owner" || ctx.role === "admin"} />
    </div>
  );
}
