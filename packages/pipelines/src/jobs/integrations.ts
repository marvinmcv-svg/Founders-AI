/** Phase 8 scheduled integration work (plan 13.1 scheduled enrichments, 13.2 network). */
import { processNetworkMoves, runDueBulkDeliveries, runScheduledCrmSyncs, syncAllNetworkSources } from "@founders/core/repo";
import type { JobDef } from "../runner";

export const crmSyncJob: JobDef = {
  name: "crm-sync",
  description: "Pull CRM objects and write enrichment back for connections on a daily/weekly schedule",
  async run(ctx) {
    const r = await runScheduledCrmSyncs();
    for (const [k, v] of Object.entries(r)) ctx.count(k, v);
  },
};

export const networkJob: JobDef = {
  name: "network",
  description: "Re-sync connected mailboxes/calendars, then alert teams when a connection changes company",
  async run(ctx) {
    const s = await syncAllNetworkSources();
    for (const [k, v] of Object.entries(s)) ctx.count(k, v);
    const m = await processNetworkMoves();
    ctx.count("moves", m.moves);
  },
};

export const bulkJob: JobDef = {
  name: "bulk",
  description: "Deliver bulk datasets that are due (full snapshot first, then incrementals) to S3 / GCS / Snowflake",
  async run(ctx) {
    const r = await runDueBulkDeliveries();
    for (const [k, v] of Object.entries(r)) ctx.count(k, v);
  },
};
