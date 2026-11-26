/**
 * Product mocks for the Talent, News and Revenue & Valuation pages.
 * Built from the synthetic fixtures in @founders/mocks (plan 1.2: mock numbers are fixture data,
 * not coverage claims). Decorative, so aria-hidden.
 */
import { AppWindow, Badge, BandChart, Card, cn, DriverBars, Favicon } from "@founders/ui";
import { FIX } from "@founders/mocks";
import { usd } from "@founders/core/format";

const s = (v: unknown) => String(v ?? "");

/* ---------- Talent ---------- */

export function SpinoutsMock({ className }: { className?: string }) {
  const rows = FIX.talent.filter((t) => t.type === "NEW_COMPANY");
  return (
    <AppWindow className={className} title="app · Spinouts" sidebar={false}>
      <div aria-hidden className="p-4">
        <div className="mb-3 flex items-center justify-between text-[12px]">
          <span className="text-ink">New companies from tracked alumni</span>
          <Badge tone="neutral">{rows.length} this month</Badge>
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line">
          <div className="grid grid-cols-[28px_1.3fr_1.2fr_0.8fr] gap-2 border-b border-line bg-sunken px-3 py-2 text-[11px] text-faint">
            <span>#</span>
            <span>Founder</span>
            <span>Previously</span>
            <span>Seen</span>
          </div>
          {rows.map((r, i) => (
            <div key={s(r.id)} className="grid grid-cols-[28px_1.3fr_1.2fr_0.8fr] items-center gap-2 border-b border-line px-3 py-2.5 text-[12px] last:border-0">
              <span className="text-faint">{i + 1}</span>
              <span className="truncate text-ink">{s(r.person_name)}</span>
              <span className="flex min-w-0 items-center gap-2 text-muted">
                <Favicon name={s(r.current_company_name)} size={16} />
                <span className="truncate">{s(r.current_company_name)}</span>
              </span>
              <span className="text-muted">{s(r.signal_date)}</span>
            </div>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}

export function TrackersMock({ className }: { className?: string }) {
  const rows = FIX.companies.slice(0, 7);
  return (
    <AppWindow className={className} title="app · Saved searches" active="Searches">
      <div aria-hidden className="p-4">
        <div className="mb-3 flex items-center justify-between text-[12px]">
          <span className="text-ink">Alumni trackers</span>
          <span className="text-muted">{rows.length} saved</span>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((c, i) => (
            <div key={s(c.id)} className="flex items-center gap-3 rounded-[10px] border border-line bg-raised px-3 py-2.5 text-[12.5px]">
              <Favicon name={s(c.name)} size={20} />
              <span className="text-ink">Alumni of {s(c.name)}</span>
              <span className="text-faint">· {s(c.hq_country)}</span>
              {i % 3 !== 2 ? <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">+{(i % 4) + 1} new</span> : <span className="ml-auto text-[11px] text-faint">up to date</span>}
            </div>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}

/* ---------- News ---------- */

const NEWS: { cat: string; score: number; line: (n: string) => string }[] = [
  { cat: "Funding", score: 5, line: (n) => `${n} closed a new round led by a regional fund.` },
  { cat: "Traction", score: 4, line: (n) => `${n} passed a new customer milestone in Brazil.` },
  { cat: "Revenue", score: 4, line: (n) => `${n} disclosed annual recurring revenue for the first time.` },
  { cat: "Deals & M&A", score: 5, line: (n) => `${n} agreed to acquire a smaller local competitor.` },
  { cat: "Profitability", score: 3, line: (n) => `${n} reported its first profitable quarter.` },
  { cat: "Traction", score: 2, line: (n) => `${n} launched its product in a second country.` },
];

export function NewsCardsMock({ className, count = 6 }: { className?: string; count?: number }) {
  return (
    <div aria-hidden className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {FIX.companies.slice(0, count).map((c, i) => {
        const n = NEWS[i % NEWS.length]!;
        return (
          <Card key={s(c.id)} className="flex flex-col gap-3 bg-raised p-4">
            <div className="flex items-center gap-2">
              <Favicon name={s(c.name)} size={22} />
              <span className="text-[13px] text-ink">{s(c.name)}</span>
              <span className="ml-auto flex gap-0.5">
                {[1, 2, 3, 4, 5].map((k) => (
                  <span key={k} className={cn("h-1.5 w-3 rounded-full", k <= n.score ? "bg-accent" : "bg-white/10")} />
                ))}
              </span>
            </div>
            <p className="text-[13.5px] leading-snug text-text">{n.line(s(c.name))}</p>
            <div className="flex items-center gap-2 text-[11px]">
              <Badge tone={n.score >= 5 ? "accent" : "neutral"}>{n.cat}</Badge>
              <span className="text-faint">{s(c.hq_city)} · {i + 1}h ago</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function CompetitorNewsMock({ className }: { className?: string }) {
  const set = FIX.profile.competitors.slice(0, 4);
  return (
    <AppWindow className={className} title={`app · ${s(FIX.profile.company.name)} · Competitors`} sidebar={false}>
      <div aria-hidden className="flex flex-col gap-2 p-4">
        {set.map((c, i) => {
          const n = NEWS[(i + 2) % NEWS.length]!;
          const name = s(c.name ?? c.company_name);
          return (
            <div key={s(c.id ?? i)} className="flex items-start gap-3 rounded-[10px] border border-line bg-raised px-3 py-3">
              <Favicon name={name} size={22} />
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink">{name}</p>
                <p className="text-[12px] text-muted">{n.line(name)}</p>
              </div>
              <Badge tone="neutral" className="ml-auto shrink-0">
                {n.cat}
              </Badge>
            </div>
          );
        })}
      </div>
    </AppWindow>
  );
}

/* ---------- Revenue & valuation ---------- */

const months = FIX.profile.estimates.map((e) => new Date(s(e.month)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }));

/** Band with two synthetic disclosure anchors where the range snaps tight. */
export function AnchoredBandMock({ className }: { className?: string }) {
  const anchors = new Set([3, 8]);
  const points = FIX.profile.estimates.map((e, i) => {
    const p50 = Number(e.revenue_p50);
    const dist = Math.min(...[...anchors].map((a) => Math.abs(a - i)));
    const near = dist === 0;
    const tight = Math.min(0.5, 0.08 + dist * 0.12);
    return { label: months[i] ?? "", p50, p10: p50 * (1 - tight), p90: p50 * (1 + tight), anchor: near ? p50 : null };
  });
  return (
    <Card className={cn("bg-raised p-5", className)}>
      <div aria-hidden>
        <div className="mb-2 flex items-center justify-between text-[12px]">
          <span className="text-ink">{s(FIX.profile.company.name)} · Estimated ARR</span>
          <span className="flex items-center gap-3 text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-accent/25" /> 90% range</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-accent" /> Disclosure</span>
          </span>
        </div>
        <BandChart points={points} height={200} format={(n) => usd(n)} />
      </div>
    </Card>
  );
}

export function ValuationMock({ className }: { className?: string }) {
  const est = FIX.profile.estimates;
  const last = est[est.length - 1] ?? {};
  const first = est[0] ?? {};
  const c = FIX.profile.company;
  return (
    <AppWindow className={className} title={`app · ${s(c.name)} · Valuation`} sidebar={false}>
      <div aria-hidden className="grid gap-4 p-5">
        <div className="flex flex-col gap-3">
          <Card className="bg-raised p-4">
            <p className="text-[11px] text-faint">Valuation estimate</p>
            <p className="font-display text-[30px] text-ink">{usd(Number(last.valuation_p50))}</p>
            <p className="text-[12px] text-muted">
              90% range {usd(Number(last.valuation_p10))}–{usd(Number(last.valuation_p90))}
            </p>
            <div className="mt-2 flex gap-1.5">
              <Badge tone="neutral">Modeled</Badge>
              <Badge tone="neutral">{s(last.confidence).toLowerCase()} confidence</Badge>
            </div>
          </Card>
          <Card className="bg-raised p-4 text-[12px]">
            <p className="text-faint">Last priced round</p>
            <p className="text-ink">
              {s(c.last_funding_type)} · {usd(Number(c.post_money_valuation_usd))} post · {s(c.last_funding_date).slice(0, 7)}
            </p>
          </Card>
        </div>
        <Card className="bg-raised p-4">
          <p className="mb-2 text-[12px] text-ink">Valuation estimate · 90% range</p>
          <BandChart
            points={est.map((e, i) => ({ label: months[i] ?? "", p10: Number(e.valuation_p10), p50: Number(e.valuation_p50), p90: Number(e.valuation_p90), anchor: null }))}
            height={170}
            format={(n) => usd(n)}
          />
          <p className="mt-2 text-[11px] text-faint">
            {months[0]} {usd(Number(first.valuation_p50))} → {months[months.length - 1]} {usd(Number(last.valuation_p50))}
          </p>
        </Card>
      </div>
    </AppWindow>
  );
}

export function DriversMock({ className }: { className?: string }) {
  const est = FIX.profile.estimates;
  const last = est[est.length - 1] ?? {};
  const drivers = (last.drivers as { label: string; impact: number }[] | undefined) ?? [];
  return (
    <div className={cn("grid gap-4 md:grid-cols-[1fr_1.2fr]", className)} aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Median (P50)", usd(Number(last.revenue_p50))],
          ["Low (P10)", usd(Number(last.revenue_p10))],
          ["High (P90)", usd(Number(last.revenue_p90))],
          ["Re-estimated", "Monthly"],
        ].map(([k, v]) => (
          <Card key={k} className="bg-raised p-4">
            <p className="text-[11px] text-faint">{k}</p>
            <p className="font-display text-[22px] text-ink">{v}</p>
          </Card>
        ))}
      </div>
      <Card className="bg-raised p-4">
        <p className="mb-3 text-[12px] text-ink">What moved this estimate</p>
        <DriverBars drivers={drivers} />
      </Card>
    </div>
  );
}
