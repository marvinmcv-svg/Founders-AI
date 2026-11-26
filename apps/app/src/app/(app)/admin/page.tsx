import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as repo from "@founders/core/repo";
import { Badge, Card } from "@founders/ui";
import { Empty, Tabs } from "@/components/profile/bits";
import { getCtx } from "@/lib/session";
import { ActivateButton, FlagToggle, ReviewButtons } from "./AdminClient";

export const metadata: Metadata = { title: "Admin" };

const usd = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
const pct = (x: unknown) => (typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "—");

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const ctx = await getCtx();
  // Not a 403 page: the console should not be discoverable by customers.
  if (!repo.isPlatformAdmin(ctx.email)) notFound();
  const a: repo.AdminContext = { email: ctx.email, userId: ctx.userId };
  const { tab = "disclosures", status = "pending" } = await searchParams;
  const st = (["pending", "verified", "rejected"].includes(status) ? status : "pending") as "pending" | "verified" | "rejected";
  const [counts, disclosures, runs, models] = await Promise.all([
    repo.disclosureCounts(a),
    tab === "disclosures" ? repo.listDisclosures(a, st) : Promise.resolve([]),
    tab === "pipelines" ? repo.recentPipelineRuns(a) : Promise.resolve([]),
    tab === "models" ? repo.modelRegistry(a) : Promise.resolve([]),
  ]);
  const flags = tab === "flags" ? await repo.listFlags() : [];
  return (
    <div className="flex flex-col">
      <div className="px-6 pt-6">
        <h1 className="text-[22px] font-semibold">Admin</h1>
        <p className="mb-4 text-[13px] text-muted">Internal console: revenue-anchor verification, pipeline runs and model versions.</p>
      </div>
      <Tabs
        base="/admin"
        active={tab}
        tabs={[
          { id: "disclosures", label: "Disclosure queue", count: counts.pending ?? 0 },
          { id: "pipelines", label: "Pipelines" },
          { id: "models", label: "Models" },
          { id: "flags", label: "Feature flags" },
        ]}
      />
      <div className="p-6">
        {tab === "disclosures" ? (
          <Card className="overflow-hidden">
            <div className="flex gap-2 border-b border-line px-4 py-2.5 text-[12px]">
              {(["pending", "verified", "rejected"] as const).map((s) => (
                <a key={s} href={`/admin?tab=disclosures&status=${s}`} className={s === st ? "text-accent" : "text-muted hover:text-ink"}>
                  {s} ({counts[s] ?? 0})
                </a>
              ))}
              <span className="ml-auto text-faint">Approved anchors are used by the next ML run; the company is re-rated.</span>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Extracted</th>
                  <th className="px-4 py-2.5 font-medium">Evidence</th>
                  <th className="px-4 py-2.5 text-right font-medium">Model now</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 text-right font-medium">{st === "pending" ? "Review" : "Reviewed"}</th>
                </tr>
              </thead>
              <tbody>
                {disclosures.map((d) => (
                  <tr key={d.id} className="border-b border-line/60 align-top">
                    <td className="px-4 py-3">
                      <a href={`/companies/${d.company_id}?tab=financials`} className="text-ink hover:text-accent">{d.company_name}</a>
                      <div className="text-[11.5px] text-faint">{d.period.slice(0, 7)} · {d.origin.replace("_", " ")}</div>
                    </td>
                    <td className="px-4 py-3 tabular">
                      {usd(d.amount_usd)} <Badge tone="neutral">{d.type}</Badge>
                    </td>
                    <td className="max-w-[360px] px-4 py-3 text-muted">{d.evidence ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular text-muted">{usd(d.current_estimate_usd)}</td>
                    <td className="px-4 py-3 text-muted">{d.publisher ?? "—"}<div className="text-[11.5px] text-faint">{when(d.published_at)}</div></td>
                    <td className="px-4 py-3 text-right">
                      {st === "pending" ? <ReviewButtons id={d.id} amount={d.amount_usd} /> : <span className="text-[12px] text-muted">{d.verified_by ?? "—"} · {when(d.reviewed_at)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!disclosures.length ? <Empty>No {st} disclosures.</Empty> : null}
          </Card>
        ) : null}

        {tab === "pipelines" ? (
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                  <th className="px-4 py-2.5 font-medium">Counts</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 align-top">
                    <td className="px-4 py-3 text-ink">{r.job}<div className="text-[11.5px] text-faint">{r.trigger}</div></td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === "SUCCEEDED" ? "positive" : r.status === "FAILED" ? "negative" : "info"}>{r.status.toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{when(r.started_at)}</td>
                    <td className="px-4 py-3 text-right tabular text-muted">
                      {r.finished_at ? `${((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="max-w-[520px] px-4 py-3 text-[12px] text-muted">
                      {r.error ? <span className="text-negative">{r.error.split("\n")[0]}</span> : Object.entries(r.counts ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!runs.length ? <Empty>No pipeline runs yet. Run `pnpm pipelines daily`.</Empty> : null}
          </Card>
        ) : null}

        {tab === "models" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {models.map((m) => {
              const rev = (m.metrics?.revenue ?? null) as Record<string, unknown> | null;
              const val = (m.metrics?.valuation ?? null) as Record<string, unknown> | null;
              return (
                <Card key={m.version} className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-medium text-ink">{m.version}</span>
                    <Badge tone="neutral">{m.kind.toLowerCase().replace("_", " ")}</Badge>
                    {m.active ? <Badge tone="positive">active</Badge> : null}
                    <span className="ml-auto">{!m.active && m.kind === "REVENUE" ? <ActivateButton version={m.version} /> : null}</span>
                  </div>
                  {rev ? (
                    <p className="text-[12.5px] text-muted">
                      Revenue: {String(rev.n_anchors)} anchors · P10–P90 coverage {pct(rev.p10_p90_coverage)} (raw {pct(rev.p10_p90_coverage_raw)}) · median APE {pct(rev.median_ape_p50)}
                      {val ? ` · Valuation: ${String(val.n_rounds)} rounds · coverage ${pct(val.p10_p90_coverage)} · median APE ${pct(val.median_ape_p50)}` : ""}
                    </p>
                  ) : (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11.5px] text-muted">{JSON.stringify(m.metrics, null, 1)?.slice(0, 1200)}</pre>
                  )}
                  <p className="mt-2 text-[11.5px] text-faint">Registered {when(m.created_at)}</p>
                </Card>
              );
            })}
          </div>
        ) : null}
        {tab === "flags" ? (
          <div className="flex max-w-3xl flex-col gap-3">
            <p className="text-[13px] text-muted">Remote switches. An empty org list means every workspace. Every change is audited.</p>
            {flags.map((f) => (
              <Card key={f.key} className="flex flex-col gap-2 p-4 text-[13px]">
                <div className="flex items-center gap-2">
                  <code className="text-ink">{f.key}</code>
                  <Badge tone={f.enabled ? "positive" : "neutral"}>{f.enabled ? (f.orgs.length ? `on for ${f.orgs.length} org(s)` : "on everywhere") : "off"}</Badge>
                </div>
                {f.note ? <p className="text-muted">{f.note}</p> : null}
                <FlagToggle flagKey={f.key} enabled={f.enabled} orgs={f.orgs} locked={f.key === "interest_telemetry"} />
                <p className="text-[11.5px] text-faint">Updated {when(f.updated_at)}{f.updated_by ? ` by ${f.updated_by}` : ""}</p>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
