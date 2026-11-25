import type { Metadata } from "next";
import * as repo from "@founders/core/repo";
import { GROWTH_STAGES, REGIONS, TAXONOMY } from "@founders/core/taxonomy";
import { getCtx } from "@/lib/session";
import { Onboarding } from "./OnboardingClient";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function Page() {
  const ctx = await getCtx();
  const org = await repo.getOrg(ctx);
  return (
    <Onboarding
      initial={(org?.thesis as Record<string, unknown> | null) ?? {}}
      sectors={TAXONOMY.sectors.map((s) => ({ value: s.id, label: s.name }))}
      stages={[...GROWTH_STAGES]}
      regions={REGIONS}
    />
  );
}
