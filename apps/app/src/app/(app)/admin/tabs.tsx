/** Admin console tabs added in Phase 10 (plan 7.14). Server components; writes go through ./actions. */
import Link from "next/link";
import * as repo from "@founders/core/repo";
import { Badge, Card } from "@founders/ui";
import { Empty } from "@/components/profile/bits";
import { ActionButton, ActionForm, MatchPicker } from "./AdminActions";
import {
  addSuppressionAction, adjustCreditsAction, dsarCompleteAction, dsarMatchAction, dsarRejectAction, dsarVerifyAction, mergeEntitiesAction,
  renameTaxonomyAction, reviewKeyAction, reviewSignalAction, updateAccountAction, updateEntityAction, verifySsoDomainAction, createIncidentAction, updateIncidentAction,
} from "./actions";

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");
const th = "px-3 py-2 font-medium";
const Head = ({ cols }: { cols: string[] }) => (
  <thead>
    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">{cols.map((c) => <th key={c} className={th}>{c}</th>)}</tr>
  </thead>
);

/* ---------------- Accounts & credits ---------------- */

export async function AccountsTab({ a, q, org }: { a: repo.AdminContext; q?: string; org?: string }) {
  if (org) return <AccountDetail a={a} orgId={org} />;
  const rows = await repo.listAccounts(a, q);
  return (
    <div className="flex flex-col gap-3">
      <form action="/admin" className="flex gap-2">
        <input type="hidden" name="tab" value="accounts" />
        <input name="q" defaultValue={q ?? ""} placeholder="Workspace name, slug or id" className="h-8 w-72 rounded-md border border-line bg-white/[0.03] px-2 text-[12.5px]" />
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <Head cols={["Workspace", "Plan", "Seats", "Subscription", "Balance", "Credits 30d", "Calls 30d", "Last active"]} />
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60">
                <td className="px-3 py-2"><Link href={`/admin?tab=accounts&org=${r.id}`} className="text-ink hover:text-accent">{r.name}</Link><div className="text-[11px] text-faint">{r.id}</div></td>
                <td className="px-3 py-2"><Badge tone="neutral">{r.plan}</Badge></td>
                <td className="px-3 py-2 tabular">{r.members} / {r.seats}</td>
                <td className="px-3 py-2 text-muted">{r.subscription_status ?? "none"}</td>
                <td className={`px-3 py-2 tabular ${r.balance < 0 ? "text-warning" : ""}`}>{num(r.balance)}</td>
                <td className="px-3 py-2 tabular">{num(r.credits_30d)}</td>
                <td className="px-3 py-2 tabular">{num(r.calls_30d)}</td>
                <td className="px-3 py-2 text-faint">{when(r.last_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <Empty>No workspaces match.</Empty> : null}
      </Card>
    </div>
  );
}

async function AccountDetail({ a, orgId }: { a: repo.AdminContext; orgId: string }) {
  const d = await repo.getAccount(a, orgId);
  const sso = await repo.listSsoProviders({ orgId, userId: a.userId, role: "admin" });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin?tab=accounts" className="text-[12px] text-muted hover:text-ink">← Accounts</Link>
        <h2 className="text-[18px] font-semibold">{d.org.name}</h2>
        <Badge tone="neutral">{d.org.plan}</Badge>
        <Badge tone={["active", "trialing"].includes(d.billing.subscription_status) ? "positive" : "neutral"}>{d.billing.subscription_status}</Badge>
        {d.org.require_sso ? <Badge tone="info">SSO required</Badge> : null}
        {d.org.require_2fa ? <Badge tone="info">2FA required</Badge> : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-[13px] text-ink">Credits · balance <span className="font-display text-[20px] text-accent">{num(d.balance)}</span>{d.overageLimit ? <span className="text-[12px] text-muted"> · overage to −{num(d.overageLimit)}</span> : null}</p>
          <ActionForm action={adjustCreditsAction.bind(null, orgId)} submit="Adjust" fields={[{ name: "amount", label: "Credits (+/−)", type: "number", width: "w-28", required: true }, { name: "note", label: "Note (contract, goodwill…)", width: "w-64", required: true }]} />
          <div className="divide-y divide-line text-[12px]">
            {d.ledger.map((l, i) => (
              <div key={i} className="flex justify-between py-1.5"><span className="text-muted">{l.reason}{l.operation ? ` · ${l.operation}` : ""}</span><span className="flex gap-3"><span>{l.delta > 0 ? "+" : ""}{num(l.delta)}</span><span className="text-faint">{when(l.at)}</span></span></div>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-[13px] text-ink">Contract terms</p>
          <p className="text-[12px] text-muted">For sales-led accounts. Seats on a Stripe subscription follow Stripe (the next subscription event overwrites them).</p>
          <ActionForm
            action={updateAccountAction.bind(null, orgId)}
            submit="Save terms"
            fields={[
              { name: "plan", label: "Plan", defaultValue: d.org.plan, width: "w-28" },
              { name: "seats", label: "Seats", type: "number", defaultValue: d.org.seats, width: "w-20" },
              { name: "periodCredits", label: "Credits / period", type: "number", defaultValue: d.billing.period_credits, width: "w-28" },
              { name: "rolloverPct", label: "Rollover %", type: "number", defaultValue: d.billing.rollover_pct, width: "w-20" },
              { name: "rolloverCap", label: "Rollover cap", type: "number", defaultValue: d.billing.rollover_cap, width: "w-28" },
              { name: "overageLimit", label: "Overage limit", type: "number", defaultValue: d.overageLimit, width: "w-28" },
            ]}
          />
        </Card>
        <Card className="p-4 text-[12.5px]">
          <p className="mb-2 text-[13px] text-ink">Members ({d.members.length} / {d.org.seats})</p>
          {d.members.map((m) => (
            <div key={m.email} className="flex items-center gap-2 py-1"><span className="text-ink">{m.name}</span><span className="text-muted">{m.email}</span><Badge tone="neutral" className="ml-auto">{m.role}</Badge>{m.two_factor_enabled ? <Badge tone="positive">2FA</Badge> : null}</div>
          ))}
        </Card>
        <Card className="p-4 text-[12.5px] xl:col-span-2">
          <p className="mb-2 text-[13px] text-ink">Single sign-on</p>
          {sso.map((p) => (
            <div key={p.provider_id} className="flex flex-wrap items-center gap-2 py-1">
              <span className="text-ink">{p.domain}</span><Badge tone="neutral">{p.protocol}</Badge><code className="text-faint">{p.provider_id}</code>
              {p.domain_verified ? <Badge tone="positive">verified</Badge> : <span className="ml-auto"><ActionButton action={verifySsoDomainAction.bind(null, p.provider_id)} label="Mark domain verified" confirm={`Only if ownership of ${p.domain} was confirmed another way (contract, support ticket). Continue?`} /></span>}
            </div>
          ))}
          {!sso.length ? <p className="text-muted">No identity provider.</p> : null}
        </Card>
        <Card className="p-4 text-[12.5px]">
          <p className="mb-2 text-[13px] text-ink">API keys</p>
          {d.keys.map((k) => (
            <div key={k.id} className="flex items-center gap-2 py-1"><span className="text-ink">{k.name}</span><code className="text-muted">{k.prefix}…</code><Badge tone={k.status === "ACTIVE" ? "positive" : k.status === "PENDING" ? "warning" : "neutral"}>{k.status.toLowerCase()}</Badge><span className="ml-auto text-faint">{k.last_used_at ? `used ${when(k.last_used_at)}` : "never used"}</span></div>
          ))}
          {!d.keys.length ? <p className="text-muted">No keys.</p> : null}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- API key approvals ---------------- */

export async function KeysTab({ a }: { a: repo.AdminContext }) {
  const keys = await repo.listPendingApiKeys(a);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <Head cols={["Key", "Workspace", "Requested by", "Scopes", "Requested", ""]} />
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b border-line/60">
              <td className="px-3 py-2 text-ink">{k.name}<div className="font-mono text-[11px] text-faint">{k.prefix}…</div></td>
              <td className="px-3 py-2"><Link href={`/admin?tab=accounts&org=${k.org_id}`} className="hover:text-accent">{k.org_name}</Link></td>
              <td className="px-3 py-2 text-muted">{k.user_name}<div className="text-[11px] text-faint">{k.user_email}</div></td>
              <td className="px-3 py-2 text-muted">{k.scopes.join(", ")}</td>
              <td className="px-3 py-2 text-faint">{when(k.created_at)}</td>
              <td className="px-3 py-2 text-right"><span className="inline-flex gap-2"><ActionButton action={reviewKeyAction.bind(null, k.id, "ACTIVE")} label="Approve" variant="primary" /><ActionButton action={reviewKeyAction.bind(null, k.id, "REVOKED")} label="Reject" variant="ghost" /></span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!keys.length ? <Empty>No keys waiting for approval.</Empty> : null}
    </Card>
  );
}

/* ---------------- Data-subject requests ---------------- */

const DSAR_TONE: Record<string, "warning" | "info" | "positive" | "neutral"> = { RECEIVED: "warning", VERIFIED: "info", COMPLETED: "positive", REJECTED: "neutral" };

export async function DsarTab({ a, id, status }: { a: repo.AdminContext; id?: string; status?: string }) {
  if (id) return <DsarDetail a={a} id={id} />;
  const st = (["open", "COMPLETED", "REJECTED"].includes(status ?? "") ? status : "open") as "open" | "COMPLETED" | "REJECTED";
  const [rows, counts, supp] = await Promise.all([repo.listDsars(a, st), repo.dsarCounts(a), repo.suppressionStats(a)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        {(["open", "COMPLETED", "REJECTED"] as const).map((s) => (
          <Link key={s} href={`/admin?tab=dsar&status=${s}`} className={s === st ? "text-accent" : "text-muted hover:text-ink"}>{s.toLowerCase()}{s === "open" ? ` (${counts.open})` : ""}</Link>
        ))}
        {counts.overdue ? <Badge tone="negative">{counts.overdue} overdue</Badge> : null}
        {counts.due_soon ? <Badge tone="warning">{counts.due_soon} due within 5 days</Badge> : null}
        <span className="ml-auto text-faint">Answer within 30 days of receipt (GDPR one month, CCPA 45 days).</span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <Head cols={["Requester", "Type", "Status", "Received", "Due", "Profiles"]} />
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60">
                <td className="px-3 py-2"><Link href={`/admin?tab=dsar&id=${r.id}`} className="text-ink hover:text-accent">{r.full_name ?? r.email}</Link><div className="text-[11px] text-faint">{r.email}</div></td>
                <td className="px-3 py-2"><Badge tone="neutral">{r.type}</Badge></td>
                <td className="px-3 py-2"><Badge tone={DSAR_TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge></td>
                <td className="px-3 py-2 text-faint">{when(r.created_at)}</td>
                <td className={`px-3 py-2 ${r.status === "COMPLETED" || r.status === "REJECTED" ? "text-faint" : r.days_left < 0 ? "text-negative" : r.days_left < 5 ? "text-warning" : "text-muted"}`}>
                  {r.status === "COMPLETED" || r.status === "REJECTED" ? when(r.completed_at) : r.days_left < 0 ? `${-r.days_left}d overdue` : `${r.days_left}d left`}
                </td>
                <td className="px-3 py-2 tabular">{r.matched_person_ids.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <Empty>No {st === "open" ? "open" : st.toLowerCase()} requests.</Empty> : null}
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-ink">Suppression list</p>
        <p className="text-[12px] text-muted">Stored as hashes. Matching profiles are withdrawn now; ingestion skips them from then on.</p>
        <div className="flex flex-wrap gap-2 text-[12px]">{supp.map((s) => <Badge key={`${s.kind}${s.reason}`} tone="neutral">{s.kind} · {s.reason.toLowerCase()} · {s.n}</Badge>)}</div>
        <ActionForm action={addSuppressionAction} submit="Suppress" variant="danger" confirm="Suppress this value and withdraw matching profiles?"
          fields={[{ name: "kind", label: "Kind", type: "select", options: ["email", "linkedin", "person_id"], width: "w-28" }, { name: "value", label: "Value", width: "w-72", required: true }, { name: "note", label: "Why", width: "w-56" }]} />
      </Card>
    </div>
  );
}

async function DsarDetail({ a, id }: { a: repo.AdminContext; id: string }) {
  const d = await repo.getDsar(a, id);
  const open = d.status === "RECEIVED" || d.status === "VERIFIED";
  const candidates = open ? await repo.findDsarMatches(a, id) : [];
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin?tab=dsar" className="text-[12px] text-muted hover:text-ink">← Requests</Link>
        <h2 className="text-[18px] font-semibold">{d.full_name ?? d.email}</h2>
        <Badge tone="neutral">{d.type}</Badge>
        <Badge tone={DSAR_TONE[d.status] ?? "neutral"}>{d.status.toLowerCase()}</Badge>
        {open ? <span className={`text-[12px] ${d.days_left < 0 ? "text-negative" : "text-muted"}`}>{d.days_left < 0 ? `${-d.days_left} days overdue` : `due in ${d.days_left} days`}</span> : null}
      </div>
      <Card className="grid gap-1 p-4 text-[12.5px] md:grid-cols-2">
        <span className="text-muted">E-mail: <span className="text-ink">{d.email}</span></span>
        <span className="text-muted">LinkedIn: <span className="text-ink">{d.linkedin_url ?? "—"}</span></span>
        <span className="text-muted md:col-span-2">Details: <span className="text-ink">{d.details ?? "—"}</span></span>
      </Card>
      {open ? (
        <>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-[13px] text-ink">1. Identity</p>
            {d.status === "VERIFIED" ? <p className="text-[12.5px] text-positive">Verified {when(d.verified_at)}.</p> : (
              <>
                <p className="text-[12px] text-muted">Waiting for the requester to click the e-mail link. If they verified another way, record how.</p>
                <ActionForm action={dsarVerifyAction.bind(null, id)} submit="Mark verified" fields={[{ name: "note", label: "How identity was verified", width: "w-96", required: true }]} />
              </>
            )}
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-[13px] text-ink">2. Profiles that are this person</p>
            <MatchPicker action={dsarMatchAction.bind(null, id)} selected={d.matched_person_ids} candidates={candidates.map((c) => ({ id: c.id, label: `${c.full_name}${c.current_title ? ` · ${c.current_title}` : ""}${c.current_company_name ? ` at ${c.current_company_name}` : ""}`, why: c.why }))} />
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-[13px] text-ink">3. Complete</p>
            <p className="text-[12px] text-muted">
              {d.type === "ACCESS" ? "Builds the export of everything held on the linked profiles and e-mails it (or download it below to send by hand)." : d.type === "DELETE" ? "Erases the linked profiles everywhere (including customer lists and notes) and suppresses the person's id, LinkedIn URL and e-mails." : "Withdraws the linked profiles from every product, drops contact data and suppresses the person."}
            </p>
            <span className="flex flex-wrap items-center gap-3">
              <ActionButton action={dsarCompleteAction.bind(null, id)} label={`Complete ${d.type.toLowerCase().replace("_", "-")}`} variant={d.type === "ACCESS" ? "primary" : "danger"} confirm={d.type === "ACCESS" ? undefined : "This cannot be undone. Continue?"} />
            </span>
            <ActionForm action={dsarRejectAction.bind(null, id)} submit="Reject" variant="ghost" fields={[{ name: "reason", label: "Reason (sent to no one; kept on the request)", width: "w-96", required: true }]} />
          </Card>
        </>
      ) : (
        <Card className="flex flex-col gap-2 p-4 text-[12.5px]">
          <p className="text-ink">Closed {when(d.completed_at)} by {d.handled_by ?? "—"}.</p>
          {d.type === "ACCESS" && d.status === "COMPLETED" ? <a href={`/api/admin/dsar/${id}`} className="text-accent hover:underline">Download the export (JSON)</a> : null}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11.5px] text-muted">{JSON.stringify(d.type === "ACCESS" ? { profiles: ((d.result?.profiles as unknown[]) ?? []).length } : d.result, null, 1)}</pre>
        </Card>
      )}
      <Card className="p-4 text-[12px]">
        <p className="mb-2 text-[13px] text-ink">History</p>
        {d.events.map((e, i) => <div key={i} className="flex gap-3 py-1"><span className="w-40 text-faint">{when(e.at)}</span><span className="text-ink">{e.action}</span><span className="text-muted">{e.actor}{e.note ? ` · ${e.note}` : ""}</span></div>)}
      </Card>
    </div>
  );
}

/* ---------------- Entity editor & merge ---------------- */

export async function EntitiesTab({ a, id }: { a: repo.AdminContext; id?: string }) {
  let entity: Awaited<ReturnType<typeof repo.getEntityForEdit>> | null = null;
  let err: string | null = null;
  if (id) {
    try {
      entity = await repo.getEntityForEdit(a, id.trim());
    } catch (e) {
      err = e instanceof Error ? e.message : "Not found";
    }
  }
  const dupes = await repo.duplicateCandidates(a, 20);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-ink">Edit a record</p>
        <form action="/admin" className="flex gap-2">
          <input type="hidden" name="tab" value="entities" />
          <input name="id" defaultValue={id ?? ""} placeholder="com_… or per_…" className="h-8 w-72 rounded-md border border-line bg-white/[0.03] px-2 text-[12.5px]" />
        </form>
        {err ? <p className="text-[12.5px] text-negative">{err}</p> : null}
        {entity ? (
          <>
            <p className="text-[12px] text-muted">
              <Link href={`/${entity.kind === "company" ? "companies" : "people"}/${String(entity.row.id)}`} className="text-accent hover:underline">{String(entity.row.name ?? entity.row.full_name)}</Link>
              {entity.row.deleted_at ? <Badge tone="negative" className="ml-2">deleted</Badge> : null} · edited fields are marked as an admin edit in provenance.
            </p>
            <ActionForm action={updateEntityAction.bind(null, String(entity.row.id))} submit="Save" fields={entity.fields.map((f) => ({ name: f, label: f.replace(/_/g, " "), defaultValue: (entity!.row[f] as string | number | null) ?? "", width: f === "description" || f === "tagline" ? "w-96" : "w-48", type: f === "description" ? "textarea" : undefined }))} />
          </>
        ) : null}
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-ink">Merge duplicates</p>
        <p className="text-[12px] text-muted">Everything pointing at the duplicate (rounds, people, signals, lists, notes, CRM links) moves to the survivor; the duplicate's name and domain become aliases.</p>
        <ActionForm action={mergeEntitiesAction} submit="Merge" variant="danger" confirm="Merge these records? This cannot be undone." fields={[{ name: "keep", label: "Keep (survivor)", width: "w-56", required: true }, { name: "drop", label: "Merge away", width: "w-56", required: true }]} />
        <div className="divide-y divide-line text-[12px]">
          {dupes.map((d) => (
            <div key={`${d.keep_id}${d.drop_id}`} className="flex flex-wrap items-center gap-2 py-1.5">
              <Link href={`/companies/${d.keep_id}`} className="text-ink hover:text-accent">{d.keep_name}</Link><span className="text-faint">{d.keep_id}</span>
              <span className="text-muted">↔</span>
              <Link href={`/companies/${d.drop_id}`} className="text-ink hover:text-accent">{d.drop_name}</Link><span className="text-faint">{d.drop_id}</span>
              <Badge tone="neutral" className="ml-auto">{d.reason}</Badge>
            </div>
          ))}
          {!dupes.length ? <p className="py-2 text-muted">No likely duplicates.</p> : null}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Taxonomy ---------------- */

export async function TaxonomyTab({ a, kind }: { a: repo.AdminContext; kind?: string }) {
  const kinds = ["SECTOR", "INDUSTRY", "TECH_VERTICAL", "BUSINESS_MODEL", "ECOSYSTEM"];
  const k = kinds.includes(kind ?? "") ? kind! : "SECTOR";
  const nodes = await repo.listTaxonomy(a, k);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-[12.5px]">
        {kinds.map((x) => <Link key={x} href={`/admin?tab=taxonomy&kind=${x}`} className={x === k ? "text-accent" : "text-muted hover:text-ink"}>{x.toLowerCase().replace("_", " ")}</Link>)}
        <span className="ml-auto text-faint">Renaming changes the label only; ids and slugs stay stable for saved searches and the API.</span>
      </div>
      <Card className="divide-y divide-line">
        {nodes.map((n) => (
          <div key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[12.5px]">
            <span className="w-56 text-ink" style={{ paddingLeft: `${Math.max(0, (n.path?.split("/").length ?? 1) - 1) * 12}px` }}>{n.name}</span>
            <code className="text-[11px] text-faint">{n.slug}</code>
            <span className="text-muted">{num(n.companies)} companies</span>
            <span className="ml-auto"><ActionForm action={renameTaxonomyAction.bind(null, n.id)} submit="Rename" variant="ghost" fields={[{ name: "name", label: "", defaultValue: n.name, width: "w-56" }]} /></span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ---------------- Signal & classifier QA ---------------- */

export async function QaTab({ a, kind }: { a: repo.AdminContext; kind?: string }) {
  const k: repo.QaKind = kind === "NEWS" ? "NEWS" : "TALENT";
  const [queue, labels, stats] = await Promise.all([repo.qaQueue(a, k, 15), repo.qaLabels(k), repo.qaStats(a)]);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 text-[12.5px]">
          <Link href="/admin?tab=qa&kind=TALENT" className={k === "TALENT" ? "text-accent" : "text-muted hover:text-ink"}>Talent signals (type)</Link>
          <Link href="/admin?tab=qa&kind=NEWS" className={k === "NEWS" ? "text-accent" : "text-muted hover:text-ink"}>News classifier (category)</Link>
        </div>
        {queue.map((s) => (
          <Card key={s.id} className="flex flex-col gap-2 p-4 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink">{s.subject}</span>
              <Badge tone="accent">{s.label}</Badge>
              <span className="text-muted">score {s.score}</span>
              <span className="ml-auto text-faint">{when(s.date)}</span>
            </div>
            <p className="text-muted">{s.summary}</p>
            <div className="flex flex-wrap items-end gap-3">
              <ActionButton action={reviewSignalAction.bind(null, k, s.id, "CORRECT", {})} label="Correct" variant="primary" />
              <ActionForm action={reviewSignalAction.bind(null, k, s.id, "WRONG")} submit="Wrong" variant="secondary"
                fields={[{ name: "corrected", label: "Should be", type: "select", options: ["", ...labels.filter((l) => l !== s.label)], width: "w-40" }, { name: "note", label: "Note", width: "w-56" }]} />
            </div>
          </Card>
        ))}
        {!queue.length ? <Empty>Nothing left to review.</Empty> : null}
      </div>
      <Card className="self-start p-4 text-[12.5px]">
        <p className="mb-1 text-[13px] text-ink">Precision on reviewed samples</p>
        <p className="mb-2 text-[11.5px] text-faint">Human-labelled set for H15; corrections are applied to the signal.</p>
        {stats.map((r) => (
          <div key={`${r.kind}${r.label}`} className="flex justify-between py-1"><span className="text-muted">{r.kind.toLowerCase()} · {r.label}</span><span className="tabular">{(r.precision * 100).toFixed(0)}% <span className="text-faint">of {r.reviewed}</span></span></div>
        ))}
        {!stats.length ? <p className="text-muted">No reviews yet.</p> : null}
      </Card>
    </div>
  );
}

/* ---------------- Status page incidents ---------------- */

export async function StatusTab({ a }: { a: repo.AdminContext }) {
  repo.assertPlatformAdmin(a);
  const [s, incidents] = await Promise.all([repo.systemStatus(), repo.recentIncidents(30)]);
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <Card className="flex flex-col gap-2 self-start p-4 text-[12.5px]">
        <p className="text-[13px] text-ink">Live checks <Link href="/status" className="ml-2 text-accent hover:underline">public page →</Link></p>
        {s.components.map((c) => (
          <div key={c.id} className="flex items-center gap-2"><Badge tone={c.state === "operational" ? "positive" : c.state === "degraded" ? "warning" : "negative"}>{c.state}</Badge><span className="text-ink">{c.name}</span><span className="ml-auto text-faint">{c.detail}</span></div>
        ))}
      </Card>
      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-[13px] text-ink">Post an incident</p>
          <ActionForm action={createIncidentAction} submit="Post" fields={[
            { name: "title", label: "Title", width: "w-80", required: true },
            { name: "impact", label: "Impact", type: "select", options: ["minor", "major", "critical"], width: "w-28" },
            { name: "components", label: `Components (${repo.STATUS_COMPONENTS.map((c) => c.id).join(", ")})`, width: "w-72", required: true },
            { name: "body", label: "First update", type: "textarea", width: "w-[32rem]" },
          ]} />
        </Card>
        {incidents.map((i) => (
          <Card key={i.id} className="flex flex-col gap-2 p-4 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] text-ink">{i.title}</span><Badge tone={i.resolved_at ? "positive" : "warning"}>{i.status}</Badge><Badge tone="neutral">{i.impact}</Badge><span className="text-faint">{i.components.join(", ")}</span></div>
            {[...i.updates].reverse().map((u, k) => <p key={k} className="text-muted"><span className="text-text">{u.status}</span> · {when(u.at)} — {u.body}</p>)}
            {!i.resolved_at ? <ActionForm action={updateIncidentAction.bind(null, i.id)} submit="Update" fields={[{ name: "status", label: "Status", type: "select", options: ["investigating", "identified", "monitoring", "resolved"], width: "w-36" }, { name: "body", label: "Update", width: "w-96", required: true }]} /> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
