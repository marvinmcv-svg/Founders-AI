import type { Metadata } from "next";
import Link from "next/link";
import * as repo from "@founders/core/repo";
import { API_TRIAL_CREDITS, MCP_FREE_CALLS_PER_DAY } from "@founders/core/limits";
import { Badge, buttonClass, Card } from "@founders/ui";
import { getCtx } from "@/lib/session";
import { McpInstall } from "@/components/mcp/McpInstall";
import { McpSettings } from "@/components/mcp/McpSettings";
import { MCP_RESOURCE } from "@/lib/auth";
import { SlackIntegration } from "./IntegrationsClient";
import { CrmIntegrations } from "@/components/integrations/CrmIntegrations";
import { NetworkSources } from "@/components/integrations/NetworkSources";
import { BulkDeliveries } from "@/components/integrations/BulkDeliveries";
import { ApiKeys, DigestPanel, InviteForm } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const ctx = await getCtx();
  const [integrations, deliveries, crmConnections, crmLog] = await Promise.all([
    repo.getIntegrations(ctx),
    repo.getAlertDeliveries(ctx, 12),
    repo.listCrmConnections(ctx),
    repo.getCrmLog(ctx, 15),
  ]);
  const [networkSources, bulk] = await Promise.all([repo.getMyNetworkSources(ctx), repo.listBulkDeliveries(ctx)]);
  const slack = integrations.find((i) => i.provider === "SLACK");
  const [org, members, keys, balance, ledger, usage, statuses, digests, audit] = await Promise.all([
    repo.getOrg(ctx),
    repo.getMembers(ctx),
    repo.listApiKeys(ctx),
    repo.getBalance(ctx.orgId),
    repo.getLedger(ctx, 12),
    repo.getUsageByDay(ctx.orgId, 30),
    repo.getStatuses(ctx),
    repo.getDigestRuns(ctx, 5),
    ctx.role === "admin" || ctx.role === "owner" ? repo.listAudit(ctx, { limit: 12 }) : Promise.resolve([] as repo.AuditRow[]),
  ]);
  const isAdmin = ctx.role === "admin" || ctx.role === "owner";
  const [mcpOverage, mcpUsage, mcpConnections] = await Promise.all([repo.getMcpOverage(ctx.orgId), repo.getMcpUsage(ctx), repo.getMcpConnections(ctx)]);
  const byOp = new Map<string, { calls: number; credits: number }>();
  for (const u of usage) {
    const k = `${u.surface} · ${u.operation}`;
    const v = byOp.get(k) ?? { calls: 0, credits: 0 };
    byOp.set(k, { calls: v.calls + u.calls, credits: v.credits + u.credits });
  }
  const Section = ({ id, title, children, sub }: { id: string; title: string; sub?: string; children: React.ReactNode }) => (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      {sub ? <p className="mb-3 text-[13px] text-muted">{sub}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
  return (
    <div className="grid gap-8 p-6 xl:grid-cols-[180px_1fr]">
      <nav className="hidden flex-col gap-1 text-[13px] xl:flex">
        {([["workspace", "Workspace"], ["members", "Members"], ["api", "API keys"], ["mcp", "MCP"], ["credits", "Credits & usage"], ["/settings/billing", "Billing"], ["notifications", "Notifications"], ["crm", "CRM"], ["network", "Network"], ["bulk", "Bulk delivery"], ["integrations", "Alerts & automation"], ["statuses", "Statuses"], ["privacy", "Data & privacy"], ["audit", "Audit log"]] as [string, string][]).map(([id, l]) => (
          <a key={id} href={id.startsWith("/") ? id : `#${id}`} className="rounded-md px-2 py-1.5 text-muted hover:bg-white/[0.05] hover:text-ink">
            {l}
          </a>
        ))}
      </nav>
      <div className="flex max-w-4xl flex-col gap-10">
        <Section id="workspace" title="Workspace">
          <Card className="flex flex-wrap items-center gap-4 p-4 text-[13px]">
            <span className="text-ink">{String(org?.name ?? "")}</span>
            <Badge tone="neutral">Plan: {String(org?.plan ?? "")}</Badge>
            <Badge tone="neutral">{members.length} / {String(org?.seats ?? "")} seats</Badge>
            <span className="text-muted">Your role: {ctx.role}</span>
            <Link href="/settings/billing" className={buttonClass("secondary", "sm", "ml-auto")}>
              Billing
            </Link>
            <Link href="/onboarding" className={buttonClass("secondary", "sm")}>
              Edit thesis
            </Link>
          </Card>
        </Section>
        <Section id="members" title="Members" sub="Admin · Member · Viewer. Users can belong to several workspaces.">
          <Card className="divide-y divide-line">
            {members.map((m) => (
              <div key={String(m.id)} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="text-ink">{String(m.name)}</span>
                <span className="text-muted">{String(m.email)}</span>
                <Badge tone="neutral" className="ml-auto">{String(m.role)}</Badge>
              </div>
            ))}
          </Card>
          {isAdmin ? <div className="mt-3"><InviteForm /></div> : null}
        </Section>
        <Section id="api" title="API keys" sub={`Keys are shown once and stored as a hash. New keys need admin approval; the first approved key adds ${API_TRIAL_CREDITS} trial credits.`}>
          <ApiKeys keys={keys} isAdmin={isAdmin} />
          <p className="mt-2 text-[12px] text-muted">
            Docs, OpenAPI and llms.txt: <Link href="/developers" className="text-accent hover:underline">API & docs</Link> · <Link href="#mcp" className="text-accent hover:underline">MCP server</Link>.
          </p>
        </Section>
        <Section id="mcp" title="MCP" sub="Connect Claude, ChatGPT, Cursor and other AI tools to this workspace's data.">
          <McpSettings overage={mcpOverage} isAdmin={isAdmin} usage={mcpUsage} connections={mcpConnections} freePerDay={MCP_FREE_CALLS_PER_DAY} />
          <div className="mt-4"><McpInstall url={MCP_RESOURCE} /></div>
        </Section>
        <Section id="credits" title="Credits & usage" sub="Exports, email reveals and API calls draw from one balance. Misses are never charged.">
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <Card className="p-4">
              <p className="text-[12px] text-muted">Balance</p>
              <p className="font-display text-[30px] text-accent">{balance.toLocaleString()}</p>
              <Link href="/settings/billing" className="text-[11px] text-accent hover:underline">Buy credits · overage</Link>
            </Card>
            <Card className="overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">Last 30 days</th>
                    <th className="px-3 py-2 text-right font-medium">Calls</th>
                    <th className="px-3 py-2 text-right font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byOp.entries()].slice(0, 10).map(([k, v]) => (
                    <tr key={k} className="border-b border-line/60">
                      <td className="px-3 py-2 text-text">{k}</td>
                      <td className="px-3 py-2 text-right tabular">{v.calls}</td>
                      <td className="px-3 py-2 text-right tabular">{v.credits}</td>
                    </tr>
                  ))}
                  {!byOp.size ? <tr><td className="px-3 py-4 text-muted" colSpan={3}>No usage yet.</td></tr> : null}
                </tbody>
              </table>
            </Card>
          </div>
          <Card className="mt-3 divide-y divide-line text-[12.5px]">
            {ledger.map((l) => (
              <div key={String(l.id)} className="flex justify-between px-4 py-2">
                <span className="text-muted">{String(l.reason)} {l.operation ? `· ${String(l.operation)}` : ""}</span>
                <span className={Number(l.delta) >= 0 ? "text-positive" : "text-text"}>{Number(l.delta) > 0 ? "+" : ""}{String(l.delta)}</span>
              </div>
            ))}
          </Card>
        </Section>
        <Section id="notifications" title="Notifications & digests" sub="Daily digest at 07:00 your time, weekly on Mondays. Email delivery turns on when Resend is configured.">
          <DigestPanel runs={digests.map((d) => ({ id: d.id, sent_at: d.sent_at, item_count: d.item_count, html: d.html }))} />
        </Section>
        <Section id="crm" title="CRM" sub="Attio, Affinity, Salesforce, HubSpot, Pipedrive and Airtable: pull with match preview, push from any grid or profile, scheduled enrichment.">
          <CrmIntegrations connections={crmConnections} log={crmLog} isAdmin={isAdmin} />
        </Section>
        <Section id="network" title="Network" sub="Your LinkedIn export, mailbox and calendar build the team's warm-path map. Opt-in per person.">
          <NetworkSources sources={networkSources} />
          <p className="mt-2 text-[12px] text-muted">
            See the whole team map and warm paths on <Link href="/network" className="text-accent hover:underline">Team Network</Link>.
          </p>
        </Section>
        <Section id="bulk" title="Bulk delivery" sub="Datasets to your S3, GCS or Snowflake: full snapshot, then daily incrementals (op column, stable IDs, manifest with checksums).">
          <BulkDeliveries deliveries={bulk} isAdmin={isAdmin} />
        </Section>
        <Section id="integrations" title="Alerts & automation" sub="Slack channel alerts, webhooks and Zapier.">
          <div className="flex flex-col gap-3">
            <SlackIntegration connected={Boolean(slack)} target={slack?.target ?? null} isAdmin={isAdmin} />
            <Card className="divide-y divide-line text-[13px]">
              <p className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-faint">Recent alert deliveries</p>
              {deliveries.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="text-ink">{d.name ?? "Saved search"}</span>
                  <Badge tone="neutral">{d.channel.replace("_", "-")}</Badge>
                  <Badge tone={d.status === "SENT" ? "positive" : d.status === "FAILED" ? "negative" : "neutral"}>{d.status.toLowerCase()}</Badge>
                  <span className="text-muted">+{d.item_count}</span>
                  {d.error ? <span className="text-[12px] text-faint">{d.error}</span> : null}
                  <span className="ml-auto text-[12px] text-faint">{new Date(d.at).toLocaleString()}</span>
                </div>
              ))}
              {!deliveries.length ? <p className="px-4 py-3 text-muted">No alerts delivered yet. Set a saved search to real-time to get one when matching data lands.</p> : null}
            </Card>
          </div>
        </Section>
        <Section id="statuses" title="Statuses" sub="Your workspace's status set, used on every grid and profile.">
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px]" style={{ color: s.color }}>
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </div>
        </Section>
        <Section id="privacy" title="Data & privacy">
          <p className="text-[13px] text-muted">Your lists, searches and notes are visible only inside this workspace. To export or delete your account data, contact privacy@ — self-serve DSAR tooling arrives with the admin console (R3).</p>
        </Section>
        <Section id="audit" title="Audit log" sub={isAdmin ? "Latest entries. The full log has filters and CSV export." : "Visible to workspace admins."}>
          {isAdmin ? (
            <>
              <Card className="divide-y divide-line text-[12.5px]">
                {audit.map((a) => (
                  <div key={a.id} className="flex justify-between gap-3 px-4 py-2">
                    <span className="text-text">{a.action} <span className="text-muted">{a.target ?? ""}</span></span>
                    <span className="shrink-0 text-faint">{a.actor_name ?? a.actor} · {new Date(a.at).toLocaleString()}</span>
                  </div>
                ))}
                {!audit.length ? <p className="px-4 py-3 text-muted">No events yet.</p> : null}
              </Card>
              <Link href="/settings/audit" className="mt-2 inline-block text-[12px] text-accent hover:underline">Open the full audit log →</Link>
            </>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
