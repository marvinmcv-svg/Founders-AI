import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as repo from "@founders/core/repo";
import { Badge, buttonClass, Card } from "@founders/ui";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

const field = "h-8 rounded-md border border-line bg-white/[0.03] px-2 text-[12.5px] text-ink outline-none focus:border-accent/50";

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; from?: string; to?: string; before?: string }> }) {
  const ctx = await getCtx();
  if (ctx.role !== "admin" && ctx.role !== "owner") notFound();
  const sp = await searchParams;
  const f: repo.AuditFilter = { action: sp.action || undefined, actor: sp.actor || undefined, from: sp.from || undefined, to: sp.to || undefined, before: sp.before || undefined, limit: 100 };
  const [rows, actions, chain] = await Promise.all([repo.listAudit(ctx, f), repo.auditActions(ctx), repo.verifyAuditChain(ctx.orgId)]);
  const qs = new URLSearchParams(Object.entries({ action: sp.action, actor: sp.actor, from: sp.from, to: sp.to }).filter((e): e is [string, string] => Boolean(e[1])));
  const last = rows.at(-1);
  const groups = [...new Set(actions.map((a) => a.split(".")[0]!))];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div>
        <Link href="/settings" className="text-[12px] text-muted hover:text-ink">← Settings</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold">Audit log</h1>
          {chain.ok ? <Badge tone="positive">Chain verified · {chain.rows - chain.legacy} entries</Badge> : <Badge tone="negative">Chain broken at #{chain.brokenAt}: {chain.reason}</Badge>}
          <a href={`/api/audit/export?${qs}`} className={buttonClass("secondary", "sm", "ml-auto")}>Export CSV</a>
        </div>
        <p className="text-[13px] text-muted">Who did what in this workspace: members, roles, keys, billing, SSO and SCIM, exports, CRM and data requests. Entries can't be edited; each one is hash-chained to the previous.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2" action="/settings/audit">
        <label className="flex flex-col gap-1 text-[11px] text-faint">Action
          <select name="action" defaultValue={sp.action ?? ""} className={field}>
            <option value="">All</option>
            {groups.map((g) => <option key={g} value={`${g}.`}>{g}.*</option>)}
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-faint">Actor (email or id)<input name="actor" defaultValue={sp.actor ?? ""} className={`${field} w-48`} /></label>
        <label className="flex flex-col gap-1 text-[11px] text-faint">From<input type="date" name="from" defaultValue={sp.from ?? ""} className={field} /></label>
        <label className="flex flex-col gap-1 text-[11px] text-faint">To<input type="date" name="to" defaultValue={sp.to ?? ""} className={field} /></label>
        <button className={buttonClass("primary", "sm")}>Filter</button>
        {qs.size ? <Link href="/settings/audit" className={buttonClass("ghost", "sm")}>Clear</Link> : null}
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Details</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-faint">{new Date(r.at).toLocaleString()}</td>
                <td className="px-3 py-2 text-text">{r.actor_name ?? r.actor}{r.actor_type !== "user" && r.actor_type !== r.actor ? <Badge tone="neutral" className="ml-1.5">{r.actor_type.replace("_", " ")}</Badge> : null}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-ink">{r.action}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-muted">{r.target ?? ""}</td>
                <td className="max-w-[260px] truncate px-3 py-2 font-mono text-[11px] text-faint">{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
                <td className="px-3 py-2 text-faint">{r.ip ?? ""}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6} className="px-3 py-4 text-muted">No entries match.</td></tr> : null}
          </tbody>
        </table>
      </Card>
      {rows.length === 100 && last ? (
        <Link href={`/settings/audit?${new URLSearchParams([...qs, ["before", new Date(last.at).toISOString()]])}`} className={buttonClass("secondary", "sm", "self-start")}>Older entries</Link>
      ) : null}
    </div>
  );
}
