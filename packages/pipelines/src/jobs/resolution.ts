/**
 * Entity resolution job (plan 9.1, D-072) — weekly, after ingest.
 *   block (domain label, domain aliases, name key + country; people: name key + company/country, shared e-mail)
 *   → Fellegi–Sunter score → auto-merge sure pairs with a hard key → queue likely pairs in /admin.
 * Options: --kind=company|person (default both), --dryRun, --limit=N (pairs per kind)
 */
import { runResolution, type MatchKind } from "@founders/core/repo";
import type { JobDef } from "../runner";

export const resolutionJob: JobDef = {
  name: "resolution",
  description: "Find and merge duplicate companies and people; queue uncertain pairs for review in /admin",
  async run(ctx) {
    const kinds: MatchKind[] = ctx.options.kind === "company" || ctx.options.kind === "person" ? [ctx.options.kind] : ["company", "person"];
    const dryRun = ctx.options.dryRun === true || ctx.options.dryRun === "true";
    const limit = typeof ctx.options.limit === "number" ? ctx.options.limit : undefined;
    for (const kind of kinds) {
      const t0 = Date.now();
      const s = await runResolution(kind, { dryRun, limit });
      ctx.count(`${kind}_pairs`, s.pairs);
      ctx.count(`${kind}_auto_merged`, s.autoMerged);
      ctx.count(`${kind}_queued`, s.queued);
      ctx.count(`${kind}_ignored`, s.ignored);
      ctx.log(`${kind}: ${s.pairs} pairs → ${s.autoMerged} merged, ${s.queued} queued, ${s.ignored} ignored, ${s.skipped} skipped${dryRun ? " (dry run)" : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  },
};
