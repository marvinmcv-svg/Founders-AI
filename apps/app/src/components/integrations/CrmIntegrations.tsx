"use client";
/**
 * Settings → Integrations → CRM (plan 13.1): connect (sandbox / API token; OAuth after marketplace
 * review), pull setup with match preview, push setup (owner, field map, auto-push), schedule,
 * enrich now, activity log.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge, buttonClass, Card, cn } from "@founders/ui";
import type { CrmProvider, CrmSchedule, PullPreview, PushConfig } from "@founders/core/repo";
import { crmConnect, crmDisconnect, crmEnrich, crmPreview, crmPull, crmSaveConfig } from "@/app/integration-actions";

const input = "h-8 rounded-md border border-line bg-white/[0.03] px-2.5 text-[12.5px] text-ink outline-none focus:border-accent/50";
const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  domain: "Domain (dedupe key)",
  tagline: "Description",
  hq: "HQ",
  employee_count: "Employees",
  growth_stage: "Growth stage",
  total_funding_usd: "Total funding",
  last_funding_date: "Last funding date",
  est_revenue_usd: "Est. revenue",
  rank: "Rank",
  profile_url: "Profile link",
  first: "First name",
  last: "Last name",
  linkedin_url: "LinkedIn (dedupe key)",
  title: "Title",
  company_name: "Company",
  location: "Location",
};

export type CrmConnectionView = {
  provider: CrmProvider;
  label: string;
  auth: ("OAUTH" | "TOKEN")[];
  connected: boolean;
  mode: string | null;
  status: string | null;
  lastError: string | null;
  schedule: CrmSchedule;
  pushConfig: PushConfig;
  lastPullAt: string | null;
  lastPushAt: string | null;
  records: number;
  matched: number;
  enriched: number;
  fieldMap: Record<"COMPANY" | "PERSON", Record<string, string>>;
};

export type CrmLogView = { id: string; provider: string; direction: string; trigger: string; entity_count: number; counts: Record<string, number> | null; status: string; error: string | null; at: string };

export function CrmIntegrations({ connections, log, isAdmin }: { connections: CrmConnectionView[]; log: CrmLogView[]; isAdmin: boolean }) {
  const [open, setOpen] = useState<CrmProvider | null>(connections.find((c) => c.connected)?.provider ?? null);
  return (
    <div className="flex flex-col gap-3">
      <Card className="divide-y divide-line">
        {connections.map((c) => (
          <div key={c.provider}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] hover:bg-white/[0.02]" onClick={() => setOpen(open === c.provider ? null : c.provider)} aria-expanded={open === c.provider}>
              {open === c.provider ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
              <span className="w-24 font-medium text-ink">{c.label}</span>
              {c.connected ? (
                <>
                  <Badge tone={c.status === "ERROR" ? "negative" : "positive"}>{c.status === "ERROR" ? "error" : c.mode === "SANDBOX" ? "sandbox" : "connected"}</Badge>
                  <span className="text-muted">
                    {c.matched.toLocaleString()} matched of {c.records.toLocaleString()} · {c.enriched.toLocaleString()} enriched
                  </span>
                  {c.schedule !== "OFF" ? <Badge tone="neutral">{c.schedule.toLowerCase()} sync</Badge> : null}
                </>
              ) : (
                <span className="text-faint">not connected</span>
              )}
            </button>
            {open === c.provider ? <Provider c={c} isAdmin={isAdmin} /> : null}
          </div>
        ))}
      </Card>
      <Card className="divide-y divide-line text-[12.5px]">
        <p className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-faint">CRM activity log</p>
        {log.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
            <Badge tone="neutral">{l.direction.toLowerCase()}</Badge>
            <span className="text-ink">{l.provider.charAt(0) + l.provider.slice(1).toLowerCase()}</span>
            <Badge tone={l.status === "SUCCEEDED" ? "positive" : l.status === "FAILED" ? "negative" : "warning"}>{l.status.toLowerCase()}</Badge>
            <span className="text-muted">
              {Object.entries(l.counts ?? {})
                .filter(([, v]) => v)
                .map(([k, v]) => `${v.toLocaleString()} ${k}`)
                .join(" · ") || `${l.entity_count} records`}
            </span>
            {l.error ? <span className="text-faint">{l.error}</span> : null}
            <span className="ml-auto text-faint">
              {l.trigger} · {new Date(l.at).toLocaleString()}
            </span>
          </div>
        ))}
        {!log.length ? <p className="px-4 py-3 text-muted">No syncs yet.</p> : null}
      </Card>
    </div>
  );
}

function Provider({ c, isAdmin }: { c: CrmConnectionView; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [token, setToken] = useState("");
  const [extra, setExtra] = useState("");
  const [objects, setObjects] = useState<("COMPANY" | "PERSON")[]>(["COMPANY", "PERSON"]);
  const [preview, setPreview] = useState<PullPreview | null>(null);
  const [owner, setOwner] = useState(c.pushConfig.owner ?? "");
  const [autoPush, setAutoPush] = useState(!!c.pushConfig.autoPushSearches);
  const [schedule, setSchedule] = useState<CrmSchedule>(c.schedule);
  const [map, setMap] = useState<Record<"COMPANY" | "PERSON", Record<string, string>>>({
    COMPANY: { ...c.fieldMap.COMPANY, ...(c.pushConfig.fieldMap?.COMPANY ?? {}) },
    PERSON: { ...c.fieldMap.PERSON, ...(c.pushConfig.fieldMap?.PERSON ?? {}) },
  });
  const act = (f: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, ok: string | ((r: Record<string, unknown>) => string)) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? { ok: true, text: typeof ok === "string" ? ok : ok(r) } : { ok: false, text: r.error ?? "Failed" });
      router.refresh();
    });

  if (!isAdmin) return <p className="px-11 pb-4 text-[12.5px] text-faint">Ask a workspace admin to manage {c.label}.</p>;

  if (!c.connected)
    return (
      <div className="flex flex-col gap-3 px-11 pb-4 text-[12.5px]">
        <p className="text-muted">
          Connect with a sandbox to try pull, match preview and push on a realistic {c.label} book (native {c.label} records stored in your workspace).
          {c.auth.includes("TOKEN") ? " Or paste an API token to connect your real account." : ""} OAuth sign-in turns on when our {c.label} marketplace app is approved.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass("primary", "sm")} disabled={pending} onClick={() => act(() => crmConnect(c.provider, { mode: "SANDBOX" }), "Sandbox connected — preview your matches below.")}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : null} Connect sandbox
          </button>
          <button className={buttonClass("secondary", "sm")} disabled title="Waiting for marketplace review">
            Sign in with {c.label}
          </button>
        </div>
        {c.auth.includes("TOKEN") ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  crmConnect(c.provider, {
                    mode: "TOKEN",
                    token: token.trim(),
                    ...(c.provider === "AIRTABLE" && extra ? { baseId: extra.trim() } : {}),
                  }),
                "Connected.",
              );
            }}
          >
            <label className="sr-only" htmlFor={`tok-${c.provider}`}>{c.label} API token</label>
            <input id={`tok-${c.provider}`} type="password" autoComplete="off" className={`${input} min-w-[260px] flex-1`} value={token} onChange={(e) => setToken(e.target.value)} placeholder={`${c.label} API token`} />
            {c.provider === "AIRTABLE" ? <input aria-label="Airtable base id" className={`${input} w-40`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Base id (app…)" /> : null}
            <button className={buttonClass("secondary", "sm")} disabled={pending || token.trim().length < 8}>Connect with token</button>
          </form>
        ) : null}
        {msg ? <p role="status" className={msg.ok ? "text-positive" : "text-negative"}>{msg.text}</p> : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-5 px-11 pb-5 text-[12.5px]">
      {c.lastError ? <p className="rounded-md border border-negative/30 bg-negative/10 p-2 text-negative">{c.lastError}</p> : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-ink">1 · Pull</h3>
        <div className="flex flex-wrap items-center gap-3">
          {(["COMPANY", "PERSON"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-text">
              <input type="checkbox" className="accent-[#d8ff4a]" checked={objects.includes(k)} onChange={(e) => setObjects((o) => (e.target.checked ? [...o, k] : o.filter((x) => x !== k)))} />
              {k === "COMPANY" ? "Companies" : "People"}
            </label>
          ))}
          <span className="text-faint">+ deals (for open-deal counts and stage)</span>
          <button
            className={buttonClass("secondary", "sm")}
            disabled={pending || !objects.length}
            onClick={() =>
              start(async () => {
                const r = await crmPreview(c.provider, objects);
                if (r.ok) setPreview(r.data);
                else setMsg({ ok: false, text: r.error });
              })
            }
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : null} Preview matches
          </button>
        </div>
        {preview ? (
          <div className="grid gap-2 md:grid-cols-2">
            {Object.entries(preview).map(([kind, p]) => (
              <div key={kind} className="rounded-lg border border-line p-3">
                <p className="text-ink">
                  <strong className="text-accent">{p.matched.toLocaleString()}</strong> {kind === "COMPANY" ? "companies" : "people"} matched &amp; visible ·{" "}
                  <span className="text-muted">{p.unmatched.toLocaleString()} unmatched</span>
                </p>
                <p className="text-[11.5px] text-faint">
                  {Object.entries(p.byMethod).map(([m, n]) => `${n} by ${m.toLowerCase()}`).join(" · ") || "no matches"}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {p.sample.map((s) => (
                    <li key={s.externalId} className="flex gap-2 truncate">
                      <span className={s.entityId ? "text-positive" : "text-faint"}>{s.entityId ? "✓" : "–"}</span>
                      <span className="truncate text-text">{s.name ?? s.key}</span>
                      <span className="truncate text-faint">{s.key}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
        <div>
          <button
            className={buttonClass("primary", "sm")}
            disabled={pending}
            onClick={() =>
              act(async () => {
                const save = await crmSaveConfig(c.provider, { pullConfig: { objects: [...objects, "DEAL"] } });
                if (!save.ok) return save;
                return crmPull(c.provider);
              }, "Pulled — CRM badges and filters are updated.")
            }
          >
            {preview ? "Confirm & pull" : "Pull now"}
          </button>
          {c.lastPullAt ? <span className="ml-3 text-faint">Last pull {new Date(c.lastPullAt).toLocaleString()}</span> : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-ink">2 · Push &amp; enrichment</h3>
        <p className="text-muted">Create-or-update by domain (companies) or LinkedIn URL (people). Push from any grid, list or profile.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-muted">Owner for new records</span>
            <input className={`${input} w-44`} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="CRM user id or name" />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted">Scheduled enrichment</span>
            <select className={input} value={schedule} onChange={(e) => setSchedule(e.target.value as CrmSchedule)}>
              <option value="OFF">Off</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-text">
            <input type="checkbox" className="accent-[#d8ff4a]" checked={autoPush} onChange={(e) => setAutoPush(e.target.checked)} /> Auto-push new saved-search matches
          </label>
        </div>
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-text">Field mapping</summary>
          <div className="grid gap-4 p-3 md:grid-cols-2">
            {(["COMPANY", "PERSON"] as const).map((kind) => (
              <table key={kind} className="w-full">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="pb-1 font-medium">{kind === "COMPANY" ? "Company field" : "Person field"}</th>
                    <th className="pb-1 font-medium">{c.label} field</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(c.fieldMap[kind]).map((f) => (
                    <tr key={f}>
                      <td className="py-0.5 pr-2 text-text">{FIELD_LABEL[f] ?? f}</td>
                      <td className="py-0.5">
                        <input
                          aria-label={`${c.label} field for ${FIELD_LABEL[f] ?? f}`}
                          className={cn(input, "h-7 w-full")}
                          value={map[kind][f] ?? ""}
                          disabled={f === "domain" || f === "linkedin_url"}
                          onChange={(e) => setMap((m) => ({ ...m, [kind]: { ...m[kind], [f]: e.target.value } }))}
                          placeholder="(skip)"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass("primary", "sm")}
            disabled={pending}
            onClick={() => act(() => crmSaveConfig(c.provider, { schedule, pushConfig: { owner: owner || null, autoPushSearches: autoPush, fieldMap: map } }), "Saved.")}
          >
            Save push settings
          </button>
          <button className={buttonClass("secondary", "sm")} disabled={pending || !c.matched} onClick={() => act(() => crmEnrich(c.provider) as Promise<{ ok: boolean; error?: string; data?: number }>, (r) => `Enriched ${String(r.data ?? 0)} records.`)}>
            Enrich matched records now
          </button>
          <button className={buttonClass("danger", "sm", "ml-auto")} disabled={pending} onClick={() => act(() => crmDisconnect(c.provider), "Disconnected.")}>
            Disconnect
          </button>
        </div>
      </section>
      {msg ? <p role="status" className={msg.ok ? "text-positive" : "text-negative"}>{msg.text}</p> : null}
    </div>
  );
}
