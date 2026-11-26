import type { Metadata } from "next";
import { CURATED_SKILLS } from "@founders/agent";
import * as repo from "@founders/core/repo";
import { SkillsClient } from "@/components/agent/SkillsClient";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Skills" };

export default async function Skills() {
  const ctx = await getCtx();
  const [own, schedules] = await Promise.all([repo.listSkills(ctx), repo.listSchedules(ctx)]);
  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <h1 className="text-[22px] font-semibold">Skills</h1>
      <p className="mb-5 text-[13px] text-muted">Reusable playbooks. Run one with <code className="rounded bg-white/[0.06] px-1">/slug</code> in the agent, share it with your team, or schedule it.</p>
      <SkillsClient
        userId={ctx.userId}
        curated={CURATED_SKILLS.map((s) => ({ slug: s.slug, name: s.name, description: s.description, steps: s.steps, outputFormat: s.outputFormat, inputs: s.inputs }))}
        own={own.map((s) => ({ id: s.id, slug: s.slug, name: s.name, description: s.description, steps: s.steps, outputFormat: s.output_format, inputs: s.inputs ?? [], visibility: s.visibility as "PRIVATE" | "TEAM", status: s.status as "DRAFT" | "SAVED", ownerId: s.owner_id, ownerName: s.owner_name ?? "" }))}
        schedules={schedules.map((s) => ({ id: s.id, skillSlug: s.skill_slug, prompt: s.prompt, cadence: s.cadence, weekday: s.weekday, hour: s.hour, timezone: s.timezone, channels: s.channels, lastRunAt: s.last_run_at, lastThreadId: s.last_thread_id }))}
      />
    </div>
  );
}
