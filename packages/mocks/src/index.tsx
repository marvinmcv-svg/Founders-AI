/**
 * Marketing product mocks (plan 3.2 packages/mocks): the real @founders/ui components rendered with
 * fixture rows exported from the synthetic seed. Decorative: aria-hidden where they duplicate text.
 */
import { ArrowUpRight, Download, Filter, Plus, SlidersHorizontal } from "lucide-react";
import { taxonomyName } from "@founders/core/taxonomy";
import { usd } from "@founders/core/format";
import { AppWindow, BandChart, Badge, Card, Chip, DataTable, Delta, Favicon, LiveDot, WindowToolbar, type Row } from "@founders/ui";
import fixtures from "./fixtures.json";

export const FIX = fixtures as unknown as {
  companies: Row[];
  growth: Row[];
  people: Row[];
  investors: Row[];
  rounds: Row[];
  talent: Row[];
  profile: { company: Row; estimates: Row[]; competitors: Row[]; news: Row[]; rounds: Row[]; metrics: { metric: string; date: string; value: number }[] };
  person: { person: Row; experience: Row[]; signals: Row[] };
};

function Toolbar({ crumb, count, chip }: { crumb: string; count: string; chip?: string }) {
  return (
    <>
      <WindowToolbar crumb={crumb} count={count}>
        <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted">
          <Download size={11} /> Export
        </span>
      </WindowToolbar>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2 text-[11px]">
        <span className="rounded-md bg-white/[0.07] px-2 py-1 text-ink">All</span>
        <span className="px-2 py-1 text-muted">Save Search</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 text-muted">
          <SlidersHorizontal size={11} /> Sort by Rank
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-muted">
          <Filter size={11} /> Add Filter <span className="rounded bg-accent px-1 text-[9px] font-semibold text-accent-ink">1</span>
        </span>
        {chip ? <Chip active className="py-0.5 text-[11px]">{chip}</Chip> : null}
      </div>
    </>
  );
}

export function CompaniesDbMock({ count, className }: { count?: string; className?: string }) {
  return (
    <AppWindow className={className} title="app · Companies" active="Company DB">
      <div aria-hidden>
        <Toolbar crumb="Companies / Database" count={count ? `${count} companies` : "companies"} chip="Growth Stage is Pre-seed / Seed" />
        <DataTable product="companies" rows={FIX.companies.slice(0, 11)} columns={["name", "tagline", "growth_stage", "hq", "employee_count", "headcount_growth_3m", "web_visits", "total_funding_usd"]} dense />
      </div>
    </AppWindow>
  );
}

export function PeopleDbMock({ className }: { className?: string }) {
  return (
    <AppWindow className={className} title="app · People" active="People DB">
      <div aria-hidden>
        <Toolbar crumb="People / Database" count="people" chip="Seniority is Founder" />
        <DataTable product="people" rows={FIX.people.slice(0, 9)} columns={["full_name", "current_title", "company", "seniority", "location", "years_experience", "highlights"]} dense />
      </div>
    </AppWindow>
  );
}

export function InvestorDbMock({ className }: { className?: string }) {
  return (
    <AppWindow className={className} title="app · Investors" active="Investor DB">
      <div aria-hidden>
        <Toolbar crumb="Investors / Database" count="investors" />
        <DataTable product="investors" rows={FIX.investors.slice(0, 9)} columns={["name", "type", "highlights", "investments_count", "exits_count", "target_stages", "aum_usd"]} dense />
      </div>
    </AppWindow>
  );
}

export function RoundsMock({ className }: { className?: string }) {
  return (
    <AppWindow className={className} title="app · Funding Rounds" active="Funding Rounds">
      <div aria-hidden>
        <Toolbar crumb="Transactions / Funding Rounds" count="sorted by Announced Date" />
        <DataTable product="funding_rounds" rows={FIX.rounds.slice(0, 9)} columns={["company", "type", "amount_usd", "announced_date", "investors"]} dense />
      </div>
    </AppWindow>
  );
}

export function TalentMock({ className }: { className?: string }) {
  return (
    <AppWindow className={className} title="app · Talent Signals" active="Talent Signals">
      <div aria-hidden>
        <Toolbar crumb="People / Talent Signals" count="last 30 days" chip="Signal Score ≥ 7" />
        <DataTable product="talent_signals" rows={FIX.talent.slice(0, 8)} columns={["person", "signal_date", "type", "summary", "status", "score"]} dense />
      </div>
    </AppWindow>
  );
}

/** Company profile card with estimate band (plan 6.3 #3 / 6.10 hero). */
export function CompanyProfileMock({ className }: { className?: string }) {
  const c = FIX.profile.company;
  const est = FIX.profile.estimates;
  const last = est[est.length - 1] ?? {};
  const points = est.map((e) => ({
    label: new Date(String(e.month)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    p10: Number(e.revenue_p10),
    p50: Number(e.revenue_p50),
    p90: Number(e.revenue_p90),
    anchor: null,
  }));
  return (
    <AppWindow className={className} title={`app · ${String(c.name)}`} sidebar={false}>
      <div className="flex flex-col gap-4 p-5" aria-hidden>
        <div className="flex items-start gap-3">
          <Favicon name={String(c.name)} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-[18px] text-ink">{String(c.name)}</span>
              <Badge tone="neutral">Rank {Number(c.rank).toLocaleString()}</Badge>
            </div>
            <p className="text-[12px] text-muted">{String(c.tagline)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip className="py-0.5 text-[11px]">{String(c.hq_city)}, {String(c.hq_country)}</Chip>
              <Chip className="py-0.5 text-[11px]">{String(c.growth_stage)}</Chip>
              <Chip className="py-0.5 text-[11px]">{String(c.customer_focus)}</Chip>
              <Chip className="py-0.5 text-[11px]">{taxonomyName(String(c.sector_id))}</Chip>
            </div>
          </div>
          <div className="ml-auto hidden gap-1.5 sm:flex">
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-text"><Plus size={11} /> Add to List</span>
          </div>
        </div>
        <div className="flex gap-4 border-b border-line text-[12px]">
          {["Overview", "Business", "Financials", "Team", "News", "Competitors"].map((t, i) => (
            <span key={t} className={i === 2 ? "-mb-px border-b-2 border-accent pb-2 text-ink" : "pb-2 text-muted"}>{t}</span>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Employees", Number(c.employee_count).toLocaleString(), <Delta key="d" value={Number(c.headcount_growth_3m)} />],
            ["Total funding", usd(Number(c.total_funding_usd)), <span key="d" className="text-muted">{String(c.last_funding_type ?? "")}</span>],
            ["Est. revenue", `~${usd(Number(last.revenue_p50))}`, <span key="d" className="text-muted">{usd(Number(last.revenue_p10))}–{usd(Number(last.revenue_p90))}</span>],
            ["Est. valuation", `~${usd(Number(last.valuation_p50))}`, <span key="d" className="text-muted">{String(last.confidence ?? "").toLowerCase()} confidence</span>],
          ].map(([label, value, sub]) => (
            <Card key={String(label)} className="bg-raised p-3">
              <p className="text-[11px] text-faint">{label}</p>
              <p className="font-display text-[17px] text-ink">{value}</p>
              <p className="text-[11px]">{sub}</p>
            </Card>
          ))}
        </div>
        <Card className="bg-raised p-3">
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="text-ink">Estimated ARR · 90% range</span>
            <Badge tone="neutral">Modeled (v0)</Badge>
          </div>
          <BandChart points={points} height={140} format={(n) => usd(n)} />
        </Card>
      </div>
    </AppWindow>
  );
}

export function CompetitorsMock({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[12px]">
        <span className="text-ink">Competitors of {String(FIX.profile.company.name)}</span>
        <span className="text-muted">Overlap 0–10</span>
      </div>
      <div className="divide-y divide-line" aria-hidden>
        {FIX.profile.competitors.slice(0, 6).map((c) => (
          <div key={String(c.id)} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <Favicon name={String(c.name)} />
            <span className="min-w-0 flex-1 truncate text-ink">{String(c.name)}</span>
            <span className="hidden truncate text-[12px] text-muted sm:block">{String(c.hq_country)}</span>
            <span className="w-20 text-right tabular text-muted">{usd(Number(c.total_funding_usd) || null)}</span>
            <span className="w-14 text-right font-display text-accent">{Number(c.overlap_score).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SignalCard({ title, body, category, time }: { title: string; body: string; category: string; time: string }) {
  return (
    <Card className="flex items-start gap-3 bg-raised p-3">
      <Favicon name={title} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-accent">{category}</span>
          <span className="text-faint">· {time}</span>
        </div>
        <p className="truncate text-[13px] text-ink">{title}</p>
        <p className="line-clamp-2 text-[12px] text-muted">{body}</p>
      </div>
    </Card>
  );
}

export function SavedSearchesMock({ className }: { className?: string }) {
  const rows = [
    ["Seed fintech in Bolivia", "Companies", 14],
    ["AI agents with headcount surge", "Companies", 38],
    ["LatAm agtech — Seed", "Companies", 22],
    ["Serial founders in LatAm", "People", 61],
    ["Stealth founders — 30 days", "Talent Signals", 128],
    ["Series A rounds — 90 days", "Funding Rounds", 9],
  ] as const;
  return (
    <AppWindow className={className} title="app · Searches" active="">
      <div aria-hidden>
        <WindowToolbar crumb="Workspace / Searches" count="6 saved searches" />
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="px-4 py-2 font-medium">Search</th>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 text-right font-medium">New results</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, product, n]) => (
              <tr key={name} className="border-b border-line/60">
                <td className="px-4 py-2.5 text-ink">{name}</td>
                <td className="px-4 py-2.5 text-muted">{product}</td>
                <td className="px-4 py-2.5 text-right">
                  <Badge>+{n}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

export function PersonCardMock({ className }: { className?: string }) {
  const p = FIX.person.person;
  const exp = FIX.person.experience.slice(0, 4);
  const sig = FIX.person.signals[0];
  return (
    <Card className={className}>
      <div className="flex items-center gap-3 border-b border-line p-4" aria-hidden>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] font-display text-ink">
          {String(p.first).charAt(0)}
          {String(p.last).charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="font-display text-[16px] text-ink">{String(p.full_name)}</p>
          <p className="truncate text-[12px] text-muted">{String(p.headline)}</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-accent-ink">Get email</span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pt-3" aria-hidden>
        {(p.highlights as string[]).slice(0, 4).map((h) => (
          <Chip key={h} active className="py-0.5 text-[11px]">{h}</Chip>
        ))}
      </div>
      {sig ? (
        <div className="mx-4 mt-3 rounded-lg border border-accent/30 bg-accent-soft p-3 text-[12px]" aria-hidden>
          <div className="flex items-center gap-2 text-accent"><LiveDot /> Talent signal · {String(sig.score)}/10</div>
          <p className="mt-1 text-text">{String(sig.summary)}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 p-4" aria-hidden>
        {exp.map((e) => (
          <div key={String(e.id)} className="flex items-center gap-2 text-[12px]">
            <Favicon name={String(e.company_name)} size={18} />
            <span className="truncate text-ink">{String(e.title)}</span>
            <span className="truncate text-muted">· {String(e.company_name)}</span>
            {e.is_current ? <Badge tone="positive" className="ml-auto">Current</Badge> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TrendingCard({ text, className }: { text: string; className?: string }) {
  const c = FIX.growth[0] ?? {};
  return (
    <Card className={className}>
      <div className="flex items-center gap-3 p-3">
        <Favicon name={String(c.name ?? "Trending")} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-accent">Trending · now</p>
          <p className="text-[13px] text-ink">{text}</p>
        </div>
        <ArrowUpRight size={14} className="text-muted" />
      </div>
    </Card>
  );
}
