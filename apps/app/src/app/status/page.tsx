import type { Metadata } from "next";
import { brand } from "@founders/config";
import * as repo from "@founders/core/repo";
import { Badge, Card, Wordmark } from "@founders/ui";

export const metadata: Metadata = { title: "Status", description: `Live status of ${brand.name}: web app, API, MCP, data pipelines, webhooks and billing.` };
export const dynamic = "force-dynamic";

const TONE = { operational: "positive", degraded: "warning", outage: "negative" } as const;
const LABEL = { operational: "Operational", degraded: "Degraded", outage: "Outage" } as const;
const when = (s: string) => new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

/** Public status page (plan 15 Phase 10). No sign-in; shows live checks and posted incidents. */
export default async function Status() {
  const [s, incidents] = await Promise.all([repo.systemStatus(), repo.recentIncidents(14)]);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-12">
      <a href="/" aria-label={brand.name}><Wordmark /></a>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-semibold">System status</h1>
        <Badge tone={TONE[s.overall]}>{s.overall === "operational" ? "All systems operational" : LABEL[s.overall]}</Badge>
      </div>
      <Card className="divide-y divide-line">
        {s.components.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
            <span className={`h-2.5 w-2.5 rounded-full ${c.state === "operational" ? "bg-positive" : c.state === "degraded" ? "bg-warning" : "bg-negative"}`} aria-hidden />
            <span className="text-ink">{c.name}</span>
            <span className="ml-auto text-[13px] text-muted">{LABEL[c.state]}</span>
          </div>
        ))}
      </Card>
      <p className="text-[12px] text-faint">Checked {when(s.checkedAt)}. Machine-readable: <a className="text-accent hover:underline" href="/api/health">/api/health</a>.</p>
      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">Incidents, last 14 days</h2>
        {incidents.map((i) => (
          <Card key={i.id} className="flex flex-col gap-2 p-4 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] text-ink">{i.title}</span>
              <Badge tone={i.resolved_at ? "positive" : i.impact === "critical" ? "negative" : "warning"}>{i.resolved_at ? "resolved" : i.status}</Badge>
              <span className="text-faint">{i.components.join(", ")}</span>
            </div>
            {[...i.updates].reverse().map((u, k) => (
              <p key={k} className="text-muted"><span className="text-text">{u.status}</span> · {when(u.at)} — {u.body}</p>
            ))}
          </Card>
        ))}
        {!incidents.length ? <p className="text-[13px] text-muted">No incidents reported.</p> : null}
      </section>
    </main>
  );
}
