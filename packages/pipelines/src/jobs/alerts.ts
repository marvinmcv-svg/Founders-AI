/**
 * Real-time alerts + scheduled digests (plan 7.11). `alerts` consumes the outbox right after
 * ingestion; `digests` runs hourly (or once a day with --anyHour on hosts limited to daily cron).
 */
import { processRealtimeAlerts, runScheduledDigests } from "@founders/core/repo";
import type { JobDef } from "../runner";

export const alertsJob: JobDef = {
  name: "alerts",
  description: "Match new outbox events against real-time saved searches; deliver in-app, email and Slack alerts",
  async run(ctx) {
    // Drain in batches so a large ingest cannot starve later events.
    for (let i = 0; i < 20; i++) {
      const r = await processRealtimeAlerts();
      for (const [k, v] of Object.entries(r)) ctx.count(k, v);
      if (!r.events) break;
    }
  },
};

export const digestsJob: JobDef = {
  name: "digests",
  description: "Send daily (07:00 local) and weekly (Monday) saved-search digests",
  async run(ctx) {
    const r = await runScheduledDigests({ anyHour: Boolean(ctx.options.anyHour) });
    for (const [k, v] of Object.entries(r)) ctx.count(k, v);
  },
};
