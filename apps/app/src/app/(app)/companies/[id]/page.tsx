import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { compact, int, pct, relativeTime, shortDate, usd } from "@founders/core/format";
import { HIGHLIGHT_LABELS, taxonomyName } from "@founders/core/taxonomy";
import * as repo from "@founders/core/repo";
import { AvatarStack, Badge, BandChart, Chip, Delta, DriverBars, Favicon, LineChart, StackBar } from "@founders/ui";
import { Notes, ProfileActions } from "@/components/profile/Actions";
import { Empty, KV, Metric, Panel, Tabs } from "@/components/profile/bits";
import { ReviewsTab, TractionTab } from "@/components/profile/TractionTabs";
import type { ReviewsDetail, TractionSnapshot } from "@founders/db/schema";
import { getCtx } from "@/lib/session";

type P = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; period?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const c = await repo.getCompany((await params).id);
  return { title: c ? String(c.name) : "Company" };
}

const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const mon = (d: unknown) => new Date(String(d)).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

export default async function CompanyProfile({ params, searchParams }: P) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const ctx = await getCtx();
  const c = await repo.getCompany(id);
  if (!c) notFound();
  const [people, investors, rounds, competitors, news, estimates, disclosures, metrics, statuses, entityStatus, liked, inLists, notes, talent, acquisitions, ipos, team] = await Promise.all([
    repo.getCompanyPeople(id, 30),
    repo.getCompanyInvestors(id),
    repo.getCompanyRounds(id),
    repo.getCompanyCompetitors(id, 10),
    repo.getCompanyNews(id, 30),
    repo.getCompanyEstimates(id),
    repo.getCompanyDisclosures(id),
    repo.getCompanyMetrics(id),
    repo.getStatuses(ctx),
    repo.getEntityStatuses(ctx, [id]),
    repo.isLiked(ctx, id),
    repo.getListsContaining(ctx, id),
    repo.getNotes(ctx, id),
    repo.getCompanyTalentSignals(id, 10),
    repo.getCompanyAcquisitions(id),
    repo.getCompanyIpos(id),
    repo.getTeamBreakdown(id),
  ]);
  const founders = people.filter((p) => p.is_founder);
  const last = estimates[estimates.length - 1];
  const series = (m: string) => metrics.filter((x) => x.metric === m);
  const labels = series("employee_count").map((x) => mon(x.date));
  const disclosureByMonth = new Map(disclosures.map((d) => [String(d.period).slice(0, 7), num(d.amount_usd)]));
  const band = estimates.map((e) => ({ label: mon(e.month), p10: Number(e.revenue_p10), p50: Number(e.revenue_p50), p90: Number(e.revenue_p90), anchor: disclosureByMonth.get(String(e.month).slice(0, 7)) ?? null }));
  const valBand = estimates.map((e) => ({ label: mon(e.month), p10: Number(e.valuation_p10), p50: Number(e.valuation_p50), p90: Number(e.valuation_p90) }));
  const base = `/companies/${id}`;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "business", label: "Business" },
    { id: "financials", label: "Financials", count: rounds.length },
    { id: "team", label: "Team", count: people.length },
    { id: "traction", label: "Traction Metrics" },
    { id: "reviews", label: "Reviews", count: Object.keys((c.reviews_detail as object | null) ?? {}).length || undefined },
    { id: "news", label: "News", count: news.length },
    { id: "competitors", label: "Competitors", count: competitors.length },
  ];
  const growth = (s: { value: number }[], back: number) => {
    const a = s[s.length - 1]?.value ?? 0;
    const b = s[s.length - 1 - back]?.value ?? 0;
    return b ? (a - b) / b : null;
  };
  const visits = series("web_visits");

  return (
    <div className="min-w-0">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-line px-6 pb-5 pt-6">
        <div className="text-[12px] text-muted">
          <Link href="/companies" className="hover:text-ink">
            Companies
          </Link>{" "}
          / {String(c.name)}
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <Favicon name={String(c.name)} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold">{String(c.name)}</h1>
              <Badge tone="neutral">Rank {int(num(c.rank))}</Badge>
              {String(c.operating_status) !== "Active" ? <Badge tone="warning">{String(c.operating_status)}</Badge> : null}
              <Badge tone="neutral">Synthetic demo data</Badge>
            </div>
            <p className="mt-1 text-[14px] text-muted">{String(c.tagline ?? "")}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip>{[c.hq_city, c.hq_country].filter(Boolean).join(", ")}</Chip>
              <Chip>Founded {String(c.founded_year ?? "—")}</Chip>
              <Chip>{String(c.customer_focus ?? "")}</Chip>
              {arr(c.business_models).map((m) => (
                <Chip key={m}>{m}</Chip>
              ))}
              <Chip>{String(c.growth_stage)}</Chip>
              {c.total_funding_usd ? <Chip>Raised {usd(num(c.total_funding_usd))}</Chip> : <Chip>Bootstrapped</Chip>}
              <Chip>
                <span className="text-muted">{String(c.domain)}</span>
              </Chip>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-[12px] text-muted">
            {founders.length ? (
              <span className="flex items-center gap-2">
                <AvatarStack names={founders.map((f) => String(f.full_name))} size={24} /> {founders.length} founder{founders.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </div>
        <ProfileActions entityType="COMPANY" id={id} liked={liked} status={entityStatus[id] ?? null} statuses={statuses} inLists={inLists} />
      </header>
      <Tabs base={base} tabs={tabs} active={tab} />

      <div className="grid gap-4 p-6">
        {tab === "overview" ? (
          <>
            <p className="max-w-4xl text-[14.5px] leading-relaxed text-text">{String(c.description ?? "")}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Metric label="Employees" value={int(num(c.employee_count))} sub={<Delta value={num(c.headcount_growth_3m)} />} />
              <Metric label="Web visits / mo" value={compact(num(c.web_visits))} sub={<Delta value={num(c.web_visits_growth_3m)} />} />
              <Metric label="Total funding" value={usd(num(c.total_funding_usd))} sub={<span className="text-muted">{String(c.last_funding_type ?? "—")}</span>} />
              <Metric label="Last round" value={usd(num(c.last_funding_usd))} sub={<span className="text-muted">{shortDate(c.last_funding_date as string | null)}</span>} />
              <Metric label="Est. revenue (ARR)" value={last ? `~${usd(num(last.revenue_p50))}` : "—"} sub={last ? <span className="text-muted">{usd(num(last.revenue_p10))}–{usd(num(last.revenue_p90))}</span> : null} />
              <Metric label="Est. valuation" value={last ? `~${usd(num(last.valuation_p50))}` : "—"} sub={last ? <span className="text-muted">{String(last.confidence).toLowerCase()} confidence</span> : null} />
            </div>
            {arr(c.highlights).length ? (
              <div className="flex flex-wrap gap-1.5">
                {arr(c.highlights).map((h) => (
                  <Chip key={h} active>
                    {HIGHLIGHT_LABELS[h] ?? h}
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Founders & key people" action={<Link href={`${base}?tab=team`} className="text-[12px] text-accent">All →</Link>}>
                {people.slice(0, 6).map((p) => (
                  <Link key={String(p.id)} href={`/people/${String(p.id)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                    <AvatarStack names={[String(p.full_name)]} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{String(p.full_name)}</span>
                      <span className="block truncate text-[12px] text-muted">{String(p.title ?? p.current_title)}</span>
                    </span>
                    {p.is_founder ? <Badge tone="neutral">Founder</Badge> : null}
                  </Link>
                ))}
                {!people.length ? <Empty>No key people on file yet.</Empty> : null}
              </Panel>
              <Panel title="Latest signals">
                {[...talent.map((t) => ({ k: "Talent", d: String(t.signal_date), s: String(t.summary) })), ...news.slice(0, 4).map((n) => ({ k: "News", d: String(n.published_at), s: String(n.title) }))]
                  .sort((a, b) => b.d.localeCompare(a.d))
                  .slice(0, 6)
                  .map((x, i) => (
                    <div key={i} className="flex gap-3 border-b border-line/60 py-2 text-[13px] last:border-0">
                      <span className="w-14 shrink-0 text-[11px] text-accent">{x.k}</span>
                      <span className="min-w-0 flex-1 text-text">{x.s}</span>
                      <span className="shrink-0 text-[11px] text-faint">{relativeTime(x.d)}</span>
                    </div>
                  ))}
                {!talent.length && !news.length ? <Empty>No recent signals.</Empty> : null}
              </Panel>
              <Panel title="Investors">
                {investors.slice(0, 8).map((i) => (
                  <Link key={String(i.id)} href={`/investors/${String(i.id)}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/[0.04]">
                    <Favicon name={String(i.name)} />
                    <span className="flex-1 truncate text-ink">{String(i.name)}</span>
                    <span className="text-[12px] text-muted">{String(i.type)}</span>
                    {i.is_lead ? <Badge>Lead</Badge> : null}
                  </Link>
                ))}
                {!investors.length ? <Empty>No disclosed investors.</Empty> : null}
              </Panel>
              <Panel title="Similar companies" action={<Link href={`${base}?tab=competitors`} className="text-[12px] text-accent">All →</Link>}>
                {competitors.slice(0, 5).map((x) => (
                  <Link key={String(x.id)} href={`/companies/${String(x.id)}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/[0.04]">
                    <Favicon name={String(x.name)} />
                    <span className="flex-1 truncate text-ink">{String(x.name)}</span>
                    <span className="text-[12px] text-muted">{String(x.hq_country)}</span>
                    <span className="w-10 text-right font-display text-accent">{Number(x.overlap_score).toFixed(1)}</span>
                  </Link>
                ))}
              </Panel>
            </div>
            <Panel title="Team notes">
              <Notes entityType="COMPANY" id={id} notes={notes} />
            </Panel>
          </>
        ) : null}

        {tab === "business" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Classification">
              <KV
                rows={[
                  ["Sector", taxonomyName(String(c.sector_id ?? ""))],
                  ["Industries", arr(c.industry_ids).map(taxonomyName).join(", ")],
                  ["Tech verticals", arr(c.tech_vertical_ids).map(taxonomyName).join(", ")],
                  ["Ecosystems", arr(c.ecosystem_ids).map(taxonomyName).join(", ") || null],
                  ["Business models", arr(c.business_models).join(", ")],
                  ["Customer focus", String(c.customer_focus ?? "")],
                  ["Customer profile", c.customer_profile ? String(c.customer_profile) : null],
                ]}
              />
            </Panel>
            <Panel title="Operations">
              <KV
                rows={[
                  ["Technologies", arr(c.technologies).join(", ") || null],
                  ["Certifications", arr(c.certifications).join(", ") || null],
                  ["Patents", int(num(c.patent_count))],
                  ["Trademarks", int(num(c.trademark_count))],
                  ["Traction", c.traction_highlights ? String(c.traction_highlights) : null],
                  ["Contact", c.contact_email ? String(c.contact_email) : null],
                  ["Reviews (G2)", c.reviews && (c.reviews as Record<string, { rating: number; count: number }>).g2 ? `${(c.reviews as Record<string, { rating: number; count: number }>).g2!.rating} ★ · ${(c.reviews as Record<string, { rating: number; count: number }>).g2!.count} reviews` : null],
                ]}
              />
            </Panel>
          </div>
        ) : null}

        {tab === "financials" ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Estimated revenue (ARR) · P10–P90" action={<Badge tone="neutral">{String(last?.model_version ?? "")}</Badge>}>
                {band.length ? <BandChart points={band} format={(n) => usd(n)} /> : <Empty>No estimate yet.</Empty>}
                <p className="mt-2 text-[12px] text-muted">
                  Latest ~{usd(num(last?.revenue_p50))} (90% range {usd(num(last?.revenue_p10))}–{usd(num(last?.revenue_p90))}) · confidence {String(last?.confidence ?? "—").toLowerCase()}
                  {disclosures.length ? ` · ${disclosures.length} verified disclosure${disclosures.length > 1 ? "s" : ""} (circles)` : ""}. Modeled — not reported figures.
                </p>
              </Panel>
              <Panel title="Estimated valuation · P10–P90">
                {valBand.length ? <BandChart points={valBand} format={(n) => usd(n)} /> : <Empty>No estimate yet.</Empty>}
                {last?.drivers ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[12px] text-muted">What moves the estimate</p>
                    <DriverBars drivers={last.drivers as { label: string; impact: number }[]} />
                  </div>
                ) : null}
              </Panel>
            </div>
            <Panel title={`Funding rounds · ${usd(num(c.total_funding_usd))} total`}>
              {rounds.length ? (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Type</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                      <th className="py-2 text-right font-medium">Post-money</th>
                      <th className="py-2 pl-6 font-medium">Investors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map((r) => (
                      <tr key={String(r.id)} className="border-b border-line/60 align-top">
                        <td className="py-2.5 text-muted">{shortDate(String(r.announced_date))}</td>
                        <td className="py-2.5">{String(r.type)}</td>
                        <td className="py-2.5 text-right tabular text-ink">{usd(num(r.amount_usd))}</td>
                        <td className="py-2.5 text-right tabular text-muted">{usd(num(r.post_money_usd))}</td>
                        <td className="py-2.5 pl-6">
                          <span className="flex flex-wrap gap-1">
                            {((r.investors as { id: string; name: string; is_lead: boolean }[]) ?? []).map((i) => (
                              <Link key={i.id} href={`/investors/${i.id}`}>
                                <Chip active={i.is_lead} className="text-[11px]">
                                  {i.name}
                                  {i.is_lead ? " · lead" : ""}
                                </Chip>
                              </Link>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty>No funding rounds on record.</Empty>
              )}
            </Panel>
            {acquisitions.length || ipos.length ? (
              <Panel title="M&A and IPO">
                {acquisitions.map((a) => (
                  <p key={String(a.id)} className="text-[13px] text-text">
                    {String(a.target_id) === id ? `Acquired by ${String(a.acquirer_name)}` : `Acquired ${String(a.target_name)}`} · {shortDate(String(a.date))} · {usd(num(a.amount_usd))}
                  </p>
                ))}
                {ipos.map((i) => (
                  <p key={String(i.id)} className="text-[13px] text-text">
                    IPO on {String(i.exchange)} ({String(i.ticker)}) · {shortDate(String(i.date))} · valued {usd(num(i.valuation_usd))}
                  </p>
                ))}
              </Panel>
            ) : null}
          </>
        ) : null}

        {tab === "team" ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title={`Headcount · ${int(num(c.employee_count))} (${pct(growth(series("employee_count"), 3))} in 3 months)`}>
                <LineChart labels={labels} series={[{ name: "Employees", values: series("employee_count").map((x) => x.value) }]} />
              </Panel>
              <Panel title="Team mix (people we track)">
                {team.dept.length ? <StackBar parts={team.dept.map((d) => ({ label: d.department ?? "Other", value: d.n }))} /> : <Empty>Not enough people on file.</Empty>}
                <div className="mt-4">{team.seniority.length ? <StackBar parts={team.seniority.map((d) => ({ label: d.seniority ?? "Other", value: d.n }))} /> : null}</div>
              </Panel>
            </div>
            <Panel title="People">
              <div className="grid gap-1 md:grid-cols-2">
                {people.map((p) => (
                  <Link key={String(p.id)} href={`/people/${String(p.id)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                    <AvatarStack names={[String(p.full_name)]} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{String(p.full_name)}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {String(p.title ?? "")} · {String(p.location ?? "")}
                      </span>
                    </span>
                    {Number(p.talent_signal_count) ? <Badge>{String(p.talent_signal_count)} signals</Badge> : null}
                  </Link>
                ))}
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "traction" ? (
          <TractionTab base={base} period={sp.period ?? "6m"} metrics={metrics} snapshot={(c.traction as TractionSnapshot | null) ?? null} />
        ) : null}

        {tab === "reviews" ? <ReviewsTab reviews={(c.reviews_detail as ReviewsDetail | null) ?? null} /> : null}

        {tab === "news" ? (
          <Panel title="Scored news (0–5)">
            {news.map((n) => (
              <div key={String(n.id)} className="flex items-start gap-3 border-b border-line/60 py-3 last:border-0">
                <span className={`w-10 shrink-0 font-display text-[18px] ${n.is_major ? "text-accent" : "text-muted"}`}>{Number(n.score).toFixed(1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-ink">{String(n.title)}</p>
                  <p className="text-[12px] text-muted">
                    {String(n.publisher)} · {shortDate(String(n.published_at))} · <span className="capitalize">{String(n.category)}</span>
                    {n.is_major ? " · major" : ""}
                  </p>
                </div>
                <a href={String(n.url)} target="_blank" rel="noopener noreferrer" className="text-faint hover:text-ink" aria-label="Source">
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
            {!news.length ? <Empty>No news yet.</Empty> : null}
          </Panel>
        ) : null}

        {tab === "competitors" ? (
          <>
            <Panel title="Competitors & look-alikes (overlap 0–10)">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="py-2 font-medium">Company</th>
                    <th className="py-2 text-right font-medium">Overlap</th>
                    <th className="py-2 text-right font-medium">Funding</th>
                    <th className="py-2 text-right font-medium">Headcount</th>
                    <th className="py-2 text-right font-medium">3m Δ</th>
                    <th className="py-2 text-right font-medium">Est. revenue</th>
                    <th className="py-2 pl-6 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-accent-soft/40">
                    <td className="py-2.5 text-ink">{String(c.name)} (this company)</td>
                    <td className="py-2.5 text-right">—</td>
                    <td className="py-2.5 text-right tabular">{usd(num(c.total_funding_usd))}</td>
                    <td className="py-2.5 text-right tabular">{int(num(c.employee_count))}</td>
                    <td className="py-2.5 text-right"><Delta value={num(c.headcount_growth_3m)} /></td>
                    <td className="py-2.5 text-right tabular">{usd(num(c.est_revenue_usd))}</td>
                    <td />
                  </tr>
                  {competitors.map((x) => (
                    <tr key={String(x.id)} className="border-b border-line/60">
                      <td className="py-2.5">
                        <Link href={`/companies/${String(x.id)}`} className="flex items-center gap-2 text-ink hover:text-accent">
                          <Favicon name={String(x.name)} /> {String(x.name)}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right font-display text-accent">{Number(x.overlap_score).toFixed(1)}</td>
                      <td className="py-2.5 text-right tabular">{usd(num(x.total_funding_usd))}</td>
                      <td className="py-2.5 text-right tabular">{int(num(x.employee_count))}</td>
                      <td className="py-2.5 text-right"><Delta value={num(x.headcount_growth_3m)} /></td>
                      <td className="py-2.5 text-right tabular">{usd(num(x.est_revenue_usd))}</td>
                      <td className="py-2.5 pl-6 text-[12px] text-muted">{String(x.reason ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Traction vs. category">
              <LineChart labels={visits.map((x) => mon(x.date))} series={[{ name: "Web visits", values: visits.map((x) => x.value) }, { name: "LinkedIn followers", values: series("linkedin_followers").map((x) => x.value) }]} />
              <p className="mt-2 text-[12px] text-muted">
                <span className="text-accent">■</span> Web visits ({pct(growth(visits, 3))} 3m) <span className="ml-3 text-info">■</span> LinkedIn followers
              </p>
            </Panel>
          </>
        ) : null}
      </div>
    </div>
  );
}
