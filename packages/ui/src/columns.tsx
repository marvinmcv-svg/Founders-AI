/**
 * Column definitions per product (plan 7.3 default columns). Shared by the app's EntityGrid and the
 * marketing mocks (same component, fixture rows) — plan 4.3 "build once".
 */
import type { ReactNode } from "react";
import { HIGHLIGHT_LABELS, taxonomyName } from "@founders/core/taxonomy";
import { compact, int, shortDate, usd } from "@founders/core/format";
import type { Product } from "@founders/core/filters";
import { AvatarStack, Badge, Chip, cn, Delta, Favicon } from "./primitives";

export type Row = Record<string, unknown>;
export type LinkFn = (kind: "company" | "person" | "investor" | "round", id: string, label: ReactNode) => ReactNode;
export type Column = { key: string; label: string; width: number; align?: "right"; sortField?: string; render: (r: Row, link: LinkFn) => ReactNode };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
const dash = <span className="text-faint">—</span>;

export const plainLink: LinkFn = (_k, _id, label) => label;

function NameCell({ name, sub, kind, id, link, badges }: { name: string; sub?: string; kind: "company" | "investor"; id: string; link: LinkFn; badges?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Favicon name={name} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-ink">{link(kind, id, name)}</span>
          {badges}
        </span>
        {sub ? <span className="block truncate text-[11px] text-faint">{sub}</span> : null}
      </span>
    </span>
  );
}

function Chips({ values, max = 2, map }: { values: string[]; max?: number; map?: (v: string) => string }) {
  if (!values.length) return dash;
  return (
    <span className="flex items-center gap-1 overflow-hidden">
      {values.slice(0, max).map((v) => (
        <Chip key={v} className="shrink-0 px-1.5 py-0.5 text-[11px]">
          {map ? map(v) : v}
        </Chip>
      ))}
      {values.length > max ? <span className="shrink-0 text-[11px] text-muted">+{values.length - max}</span> : null}
    </span>
  );
}

const statusTone = (v: string) => (v === "STEALTH" ? "accent" : v === "HR" ? "warning" : "positive") as "accent" | "warning" | "positive";
const SIGNAL_LABEL: Record<string, string> = {
  NEW_COMPANY: "New Company",
  NEW_ROLE: "New Role",
  PROMOTION: "Promotion",
  SEARCHING: "Searching",
  OUT_OF_STEALTH: "Out of Stealth",
  DEPARTURE: "Departure",
};

export const COLUMNS: Record<Product, Column[]> = {
  companies: [
    { key: "name", label: "Company", width: 230, sortField: "name", render: (r, l) => <NameCell name={s(r.name)} sub={s(r.domain)} kind="company" id={s(r.id)} link={l} /> },
    { key: "tagline", label: "Tagline", width: 260, render: (r) => <span className="line-clamp-1 text-muted">{s(r.tagline) || "—"}</span> },
    { key: "growth_stage", label: "Growth Stage", width: 130, render: (r) => <Chip className="px-1.5 py-0.5 text-[11px]">{s(r.growth_stage)}</Chip> },
    { key: "hq", label: "HQ Location", width: 170, render: (r) => <span className="truncate">{[r.hq_city, r.hq_country].filter(Boolean).join(", ") || "—"}</span> },
    {
      key: "founders",
      label: "Founders",
      width: 150,
      render: (r) => {
        const f = (Array.isArray(r.founders) ? r.founders : []) as { name: string }[];
        return f.length ? <AvatarStack names={f.map((x) => x.name)} size={22} max={2} /> : dash;
      },
    },
    { key: "employee_count", label: "Employees", width: 100, align: "right", sortField: "employee_count", render: (r) => <span className="tabular">{int(n(r.employee_count))}</span> },
    { key: "headcount_growth_3m", label: "3m Δ", width: 80, align: "right", sortField: "headcount_growth_3m", render: (r) => <Delta value={n(r.headcount_growth_3m)} /> },
    { key: "web_visits", label: "Web Visits", width: 100, align: "right", sortField: "web_visits", render: (r) => <span className="tabular">{compact(n(r.web_visits))}</span> },
    { key: "web_visits_growth_3m", label: "3m Δ ", width: 80, align: "right", sortField: "web_visits_growth_3m", render: (r) => <Delta value={n(r.web_visits_growth_3m)} /> },
    { key: "business_models", label: "Business Models", width: 160, render: (r) => <Chips values={arr(r.business_models)} max={1} /> },
    { key: "industry", label: "Industry", width: 200, render: (r) => <span className="truncate text-muted">{s(r.sector_id) ? `${taxonomyName(s(r.sector_id))} › ${taxonomyName(arr(r.industry_ids)[0] ?? "")}` : "—"}</span> },
    { key: "tech_vertical", label: "Tech Vertical", width: 220, render: (r) => <Chips values={arr(r.tech_vertical_ids)} max={1} map={taxonomyName} /> },
    { key: "total_funding_usd", label: "Total Funding", width: 120, align: "right", sortField: "total_funding_usd", render: (r) => <span className="tabular">{usd(n(r.total_funding_usd))}</span> },
    { key: "last_funding_date", label: "Last Funding", width: 120, sortField: "last_funding_date", render: (r) => <span className="tabular text-muted">{shortDate(s(r.last_funding_date) || null)}</span> },
    { key: "est_revenue_usd", label: "Est. Revenue", width: 110, align: "right", sortField: "est_revenue_usd", render: (r) => <span className="tabular">{r.est_revenue_usd ? `~${usd(n(r.est_revenue_usd))}` : "—"}</span> },
    { key: "est_valuation_usd", label: "Est. Valuation", width: 120, align: "right", sortField: "est_valuation_usd", render: (r) => <span className="tabular">{r.est_valuation_usd ? `~${usd(n(r.est_valuation_usd))}` : "—"}</span> },
    { key: "highlights", label: "Highlights", width: 200, render: (r) => <Chips values={arr(r.highlights)} max={1} map={(v) => HIGHLIGHT_LABELS[v] ?? v} /> },
    { key: "rank", label: "Rank", width: 80, align: "right", sortField: "rank", render: (r) => <span className="tabular text-muted">{int(n(r.rank))}</span> },
  ],
  people: [
    {
      key: "full_name",
      label: "Person",
      width: 220,
      sortField: "full_name",
      render: (r, l) => (
        <span className="flex min-w-0 items-center gap-2">
          <AvatarStack names={[s(r.full_name)]} size={24} />
          <span className="truncate font-medium text-ink">{l("person", s(r.id), s(r.full_name))}</span>
        </span>
      ),
    },
    { key: "current_title", label: "Current Title", width: 200, render: (r) => <span className="truncate">{s(r.current_title) || "—"}</span> },
    {
      key: "company",
      label: "Company",
      width: 180,
      render: (r, l) =>
        r.current_company_id ? (
          <span className="flex min-w-0 items-center gap-2">
            <Favicon name={s(r.current_company_name)} size={18} />
            <span className="truncate">{l("company", s(r.current_company_id), s(r.current_company_name))}</span>
          </span>
        ) : (
          dash
        ),
    },
    { key: "seniority", label: "Seniority", width: 110, render: (r) => <span className="text-muted">{s(r.seniority) || "—"}</span> },
    { key: "location", label: "Location", width: 190, render: (r) => <span className="truncate text-muted">{s(r.location) || "—"}</span> },
    { key: "years_experience", label: "Yrs Exp", width: 80, align: "right", sortField: "years_experience", render: (r) => <span className="tabular">{int(n(r.years_experience))}</span> },
    { key: "highlights", label: "Highlights", width: 230, render: (r) => <Chips values={arr(r.highlights)} max={1} /> },
    { key: "education_summary", label: "Education", width: 240, render: (r) => <span className="truncate text-muted">{s(r.education_summary) || "—"}</span> },
    { key: "talent_signal_count", label: "Talent Signals", width: 110, align: "right", sortField: "talent_signal_count", render: (r) => <span className="tabular">{int(n(r.talent_signal_count))}</span> },
  ],
  investors: [
    { key: "name", label: "Investor", width: 240, sortField: "name", render: (r, l) => <NameCell name={s(r.name)} sub={[r.hq_city, r.hq_country].filter(Boolean).join(", ")} kind="investor" id={s(r.id)} link={l} /> },
    { key: "type", label: "Investor Type", width: 120, render: (r) => <Chip className="px-1.5 py-0.5 text-[11px]">{s(r.type)}</Chip> },
    { key: "highlights", label: "Highlights", width: 190, render: (r) => <Chips values={arr(r.highlights)} max={1} /> },
    { key: "investments_count", label: "# Investments", width: 120, align: "right", sortField: "investments_count", render: (r) => <span className="tabular">{int(n(r.investments_count))}</span> },
    { key: "exits_count", label: "# Exits", width: 90, align: "right", sortField: "exits_count", render: (r) => <span className="tabular">{int(n(r.exits_count))}</span> },
    { key: "target_stages", label: "Target Stages", width: 200, render: (r) => <Chips values={arr(r.target_stages)} max={2} /> },
    { key: "aum_usd", label: "AUM", width: 100, align: "right", sortField: "aum_usd", render: (r) => <span className="tabular">{usd(n(r.aum_usd))}</span> },
    { key: "check", label: "Check size", width: 140, align: "right", render: (r) => <span className="tabular text-muted">{r.check_min ? `${usd(n(r.check_min))}–${usd(n(r.check_max))}` : "—"}</span> },
    { key: "follow_on_rate", label: "Follow-on", width: 100, align: "right", sortField: "follow_on_rate", render: (r) => <span className="tabular">{r.follow_on_rate === null || r.follow_on_rate === undefined ? "—" : `${Math.round(Number(r.follow_on_rate) * 100)}%`}</span> },
  ],
  funding_rounds: [
    { key: "company", label: "Company", width: 230, render: (r, l) => <NameCell name={s(r.company_name)} sub={s(r.company_country)} kind="company" id={s(r.company_id)} link={l} /> },
    { key: "type", label: "Investment Type", width: 140, render: (r) => <Chip className="px-1.5 py-0.5 text-[11px]">{s(r.type)}</Chip> },
    { key: "amount_usd", label: "Raised (USD)", width: 120, align: "right", sortField: "amount_usd", render: (r) => <span className="tabular font-medium text-ink">{usd(n(r.amount_usd))}</span> },
    { key: "announced_date", label: "Announced Date", width: 140, sortField: "announced_date", render: (r) => <span className="tabular text-muted">{shortDate(s(r.announced_date))}</span> },
    {
      key: "investors",
      label: "Investors",
      width: 320,
      render: (r, l) => {
        const inv = (Array.isArray(r.investors) ? r.investors : []) as { id: string; name: string; is_lead: boolean }[];
        if (!inv.length) return dash;
        return (
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            {inv.slice(0, 2).map((i) => (
              <Chip key={i.id} className={cn("shrink-0 px-1.5 py-0.5 text-[11px]", i.is_lead && "border-accent/40")}>
                {l("investor", i.id, i.name)}
                {i.is_lead ? <span className="text-accent">lead</span> : null}
              </Chip>
            ))}
            {inv.length > 2 ? <span className="text-[11px] text-muted">+{inv.length - 2}</span> : null}
          </span>
        );
      },
    },
    { key: "post_money_usd", label: "Post-money", width: 120, align: "right", sortField: "post_money_usd", render: (r) => <span className="tabular text-muted">{usd(n(r.post_money_usd))}</span> },
  ],
  talent_signals: [
    {
      key: "person",
      label: "Person",
      width: 210,
      render: (r, l) => (
        <span className="flex min-w-0 items-center gap-2">
          <AvatarStack names={[s(r.person_name)]} size={24} />
          <span className="truncate font-medium text-ink">{l("person", s(r.person_id), s(r.person_name))}</span>
        </span>
      ),
    },
    { key: "signal_date", label: "Signal Date", width: 120, sortField: "signal_date", render: (r) => <span className="tabular text-muted">{shortDate(s(r.signal_date))}</span> },
    { key: "type", label: "Signal Type", width: 140, render: (r) => <Chip className="px-1.5 py-0.5 text-[11px]">{SIGNAL_LABEL[s(r.type)] ?? s(r.type)}</Chip> },
    { key: "summary", label: "Signal Summary", width: 380, render: (r) => <span className="line-clamp-1 text-muted">{s(r.summary)}</span> },
    { key: "status", label: "Status", width: 100, render: (r) => <Badge tone={statusTone(s(r.status))}>{s(r.status) === "HR" ? "Searching" : cap(s(r.status))}</Badge> },
    { key: "score", label: "Score", width: 80, align: "right", sortField: "score", render: (r) => <span className="tabular font-medium text-ink">{s(r.score)}/10</span> },
    { key: "experience", label: "Current Experience", width: 220, render: (r) => <span className="truncate text-muted">{[r.current_title, r.current_company_name].filter(Boolean).join(" · ")}</span> },
  ],
  acquisitions: [
    {
      key: "acquirer",
      label: "Acquirer",
      width: 220,
      render: (r, l) =>
        r.acquirer_id ? (
          <NameCell name={s(r.acquirer_name)} kind="company" id={s(r.acquirer_id)} link={l} />
        ) : (
          <span className="flex items-center gap-2">
            <Favicon name={s(r.acquirer_name)} />
            <span className="truncate text-ink">{s(r.acquirer_name)}</span>
          </span>
        ),
    },
    { key: "target", label: "Target", width: 240, render: (r, l) => <NameCell name={s(r.target_name)} sub={s(r.target_country)} kind="company" id={s(r.target_id)} link={l} /> },
    { key: "date", label: "Date", width: 120, sortField: "date", render: (r) => <span className="tabular text-muted">{shortDate(s(r.date))}</span> },
    { key: "amount_usd", label: "Amount", width: 120, align: "right", sortField: "amount_usd", render: (r) => <span className="tabular font-medium text-ink">{r.amount_usd ? usd(n(r.amount_usd)) : <span className="text-faint">Undisclosed</span>}</span> },
    { key: "status", label: "Status", width: 110, render: (r) => <Badge tone={s(r.status) === "Completed" ? "positive" : "neutral"}>{s(r.status)}</Badge> },
    { key: "tagline", label: "Target tagline", width: 320, render: (r) => <span className="line-clamp-1 text-muted">{s(r.target_tagline)}</span> },
  ],
  ipos: [
    { key: "company", label: "Company", width: 230, render: (r, l) => <NameCell name={s(r.company_name)} sub={s(r.company_country)} kind="company" id={s(r.company_id)} link={l} /> },
    { key: "date", label: "Date", width: 120, sortField: "date", render: (r) => <span className="tabular text-muted">{shortDate(s(r.date))}</span> },
    { key: "exchange", label: "Exchange", width: 100, render: (r) => <Chip className="px-1.5 py-0.5 text-[11px]">{s(r.exchange)}</Chip> },
    { key: "ticker", label: "Ticker", width: 90, render: (r) => <span className="font-mono text-[12px] text-ink">{s(r.ticker)}</span> },
    { key: "share_price", label: "Share price", width: 110, align: "right", sortField: "share_price", render: (r) => <span className="tabular">{r.share_price ? usd(n(r.share_price)) : "—"}</span> },
    { key: "valuation_usd", label: "Valuation", width: 120, align: "right", sortField: "valuation_usd", render: (r) => <span className="tabular font-medium text-ink">{usd(n(r.valuation_usd))}</span> },
    { key: "raised_usd", label: "Raised", width: 110, align: "right", sortField: "raised_usd", render: (r) => <span className="tabular text-muted">{usd(n(r.raised_usd))}</span> },
  ],
  news_signals: [
    { key: "company", label: "Company", width: 210, render: (r, l) => <NameCell name={s(r.company_name)} sub={s(r.company_country)} kind="company" id={s(r.company_id)} link={l} /> },
    { key: "published_at", label: "Published", width: 110, sortField: "published_at", render: (r) => <span className="tabular text-muted">{shortDate(s(r.published_at))}</span> },
    { key: "category", label: "Category", width: 120, render: (r) => <Chip className="px-1.5 py-0.5 text-[11px] capitalize">{s(r.category) === "deals" ? "M&A / deals" : s(r.category)}</Chip> },
    {
      key: "summary",
      label: "Summary",
      width: 380,
      render: (r) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {r.is_major ? <Badge tone="warning">Major</Badge> : null}
          <span className="line-clamp-1 text-muted" title={s(r.title)}>
            {s(r.summary)}
          </span>
        </span>
      ),
    },
    { key: "score", label: "Score", width: 80, align: "right", sortField: "score", render: (r) => <span className="tabular font-medium text-ink">{Number(r.score ?? 0).toFixed(1)}</span> },
    { key: "publisher", label: "Source", width: 180, render: (r) => <span className="truncate text-muted">{s(r.publisher)}</span> },
  ],
};

function cap(x: string) {
  return x.charAt(0) + x.slice(1).toLowerCase();
}

export { SIGNAL_LABEL };

/** Static table (marketing mocks, list previews). The app uses the interactive EntityGrid. */
export function DataTable({ product, rows, columns, link = plainLink, className, dense }: { product: Product; rows: Row[]; columns?: string[]; link?: LinkFn; className?: string; dense?: boolean }) {
  const cols = columns ? COLUMNS[product].filter((c) => columns.includes(c.key)) : COLUMNS[product];
  return (
    <div className={cn("overflow-hidden", className)}>
      <table className="w-full table-fixed border-collapse text-[12.5px]">
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
            {cols.map((c) => (
              <th key={c.key} className={cn("px-3 py-2 font-medium", c.align === "right" && "text-right")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={s(r.id) || i} className="border-b border-line/60">
              {cols.map((c) => (
                <td key={c.key} className={cn("overflow-hidden whitespace-nowrap px-3", dense ? "py-1.5" : "py-2.5", c.align === "right" && "text-right")}>
                  {c.render(r, link)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
