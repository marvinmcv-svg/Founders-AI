/** Phase 10 daily housekeeping: metered overage to Stripe (plan 14.1) and DSAR deadlines (plan 14.5). */
import { sql } from "drizzle-orm";
import { recordAudit, reportOverageUsage, rawQuery, PLATFORM_ORG } from "@founders/core/repo";
import type { JobDef } from "../runner";

export const billingUsageJob: JobDef = {
  name: "billing-usage",
  description: "Send credits used past zero (overage) to the Stripe billing meter; retry failed sends with the same identifier",
  async run(ctx) {
    const reports = await reportOverageUsage();
    ctx.count("reports", reports.length);
    ctx.count("credits", reports.reduce((s, r) => s + (r.status === "SENT" ? r.credits : 0), 0));
    ctx.count("failed", reports.filter((r) => r.status === "FAILED").length);
    ctx.count("skipped_no_stripe", reports.filter((r) => r.status === "SKIPPED").length);
  },
};

export const privacySlaJob: JobDef = {
  name: "privacy-sla",
  description: "Flag data-subject requests that are overdue or due within 5 days (platform audit + run counts for /admin)",
  async run(ctx) {
    const rows = await rawQuery<{ id: string; due_at: string; overdue: boolean }>(sql`SELECT id, due_at, due_at < now() AS overdue FROM dsar_requests
      WHERE status IN ('RECEIVED', 'VERIFIED') AND due_at < now() + interval '5 days' ORDER BY due_at`);
    const overdue = rows.filter((r) => r.overdue);
    ctx.count("open_due_soon", rows.length - overdue.length);
    ctx.count("overdue", overdue.length);
    for (const r of overdue) await recordAudit({ orgId: PLATFORM_ORG, actor: "system", actorType: "system", action: "dsar.overdue", target: r.id });
    if (rows.length) ctx.log(`DSAR: ${overdue.length} overdue, ${rows.length - overdue.length} due within 5 days`);
  },
};
