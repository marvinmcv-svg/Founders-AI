/**
 * Customer webhook delivery (plan 11 #72): signed POSTs with retries/backoff; endpoints that fail
 * for 24 h are disabled. Runs after `alerts`, which queues the events; point a sub-hourly scheduler
 * at /api/cron/webhooks for timely retries.
 */
import { deliverDueWebhooks } from "@founders/core/repo";
import type { JobDef } from "../runner";

export const webhooksJob: JobDef = {
  name: "webhooks",
  description: "Deliver queued customer webhook events (HMAC-signed, retries with backoff, auto-disable)",
  async run(ctx) {
    for (let i = 0; i < 10; i++) {
      const r = await deliverDueWebhooks();
      for (const [k, v] of Object.entries(r)) ctx.count(k, v);
      if (r.due < 500) break;
    }
  },
};
