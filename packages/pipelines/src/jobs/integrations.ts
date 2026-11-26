/** Phase 8 scheduled integration work (plan 13.1 scheduled enrichments). */
import { runScheduledCrmSyncs } from "@founders/core/repo";
import type { JobDef } from "../runner";

export const crmSyncJob: JobDef = {
  name: "crm-sync",
  description: "Pull CRM objects and write enrichment back for connections on a daily/weekly schedule",
  async run(ctx) {
    const r = await runScheduledCrmSyncs();
    for (const [k, v] of Object.entries(r)) ctx.count(k, v);
  },
};
