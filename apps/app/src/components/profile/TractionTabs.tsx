/** Company profile tabs 5–6 (plan 7.7): Traction Metrics and Reviews. Server components. */
import Link from "next/link";
import { compact, int } from "@founders/core/format";
import { Badge, cn, Delta, LineChart, StackBar } from "@founders/ui";
import type { ReviewsDetail, TractionSnapshot } from "@founders/db/schema";
import { Empty, Metric, Panel } from "./bits";

type Point = { metric: string; date: string; value: number };

export const PERIODS = [
  { id: "1m", months: 1 },
  { id: "3m", months: 3 },
  { id: "6m", months: 6 },
  { id: "12m", months: 12 },
] as const;

const mon = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

function lastMonths(metrics: Point[], metric: string, months: number) {
  const s = metrics.filter((m) => m.metric === metric).sort((a, b) => a.date.localeCompare(b.date));
  // A 1m view still needs the previous month to show a change.
  return s.slice(-Math.max(2, months + 1));
}

function change(s: Point[]): number | null {
  const a = s[s.length - 1]?.value;
  const b = s[0]?.value;
  return a !== undefined && b ? (a - b) / b : null;
}

function SeriesPanel({ title, s, format, invert }: { title: string; s: Point[]; format: (n: number) => string; invert?: boolean }) {
  if (!s.length) return null;
  const d = change(s);
  return (
    <Panel
      title={title}
      action={
        <span className="flex items-center gap-2 text-[12px]">
          <span className="tabular text-ink">{format(s[s.length - 1]!.value)}</span>
          {d !== null ? <Delta value={invert ? -d : d} /> : null}
        </span>
      }
    >
      <LineChart series={[{ name: title, values: s.map((x) => x.value) }]} labels={s.map((x) => mon(x.date))} height={130} />
    </Panel>
  );
}

export function TractionTab({ base, period, metrics, snapshot }: { base: string; period: string; metrics: Point[]; snapshot: TractionSnapshot | null }) {
  const months = PERIODS.find((p) => p.id === period)?.months ?? 6;
  const w = (m: string) => lastMonths(metrics, m, months);
  const visits = w("web_visits");
  const rank = w("web_rank");
  const has = (m: string) => w(m).length > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 text-[12px]" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <Link
            key={p.id}
            href={`${base}?tab=traction&period=${p.id}`}
            scroll={false}
            role="tab"
            aria-selected={p.id === period}
            className={cn("rounded-md px-2.5 py-1", p.id === period ? "bg-white/[0.08] text-ink" : "text-muted hover:text-ink")}
          >
            {p.id}
          </Link>
        ))}
        <span className="ml-auto text-faint">Monthly panel data · modeled for the demo universe</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Web visits / month" value={compact(visits[visits.length - 1]?.value)} sub={<Delta value={change(visits)} />} />
        <Metric label="Popularity rank" value={rank.length ? `#${int(rank[rank.length - 1]!.value)}` : "—"} sub={rank.length > 1 ? <Delta value={-(change(rank) ?? 0)} /> : null} />
        <Metric label="Employees" value={int(w("employee_count").at(-1)?.value)} sub={<Delta value={change(w("employee_count"))} />} />
        <Metric label="LinkedIn followers" value={compact(w("linkedin_followers").at(-1)?.value)} sub={<Delta value={change(w("linkedin_followers"))} />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SeriesPanel title="Web visits" s={visits} format={compact} />
        <SeriesPanel title="Popularity rank (lower is better)" s={rank} format={(n) => `#${int(n)}`} invert />
        {has("bounce_rate") ? <SeriesPanel title="Bounce rate" s={w("bounce_rate")} format={(n) => `${(n * 100).toFixed(0)}%`} invert /> : null}
        {has("pages_per_visit") ? <SeriesPanel title="Pages per visit" s={w("pages_per_visit")} format={(n) => n.toFixed(1)} /> : null}
        {has("avg_session_s") ? <SeriesPanel title="Avg. session duration" s={w("avg_session_s")} format={(n) => `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`} /> : null}
        <SeriesPanel title="Employee count" s={w("employee_count")} format={int} />
        <SeriesPanel title="LinkedIn followers" s={w("linkedin_followers")} format={compact} />
        <SeriesPanel title="X followers" s={w("x_followers")} format={compact} />
        <SeriesPanel title="Instagram followers" s={w("instagram_followers")} format={compact} />
        {has("app_installs") ? <SeriesPanel title="App installs (iOS + Android)" s={w("app_installs")} format={compact} /> : null}
        {has("app_rating") ? <SeriesPanel title="App store rating" s={w("app_rating")} format={(n) => `${n.toFixed(2)} ★`} /> : null}
        {has("chrome_extension_users") ? <SeriesPanel title="Chrome extension users" s={w("chrome_extension_users")} format={compact} /> : null}
      </div>
      {snapshot ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Traffic sources">
            <StackBar parts={Object.entries(snapshot.traffic_sources).map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }))} />
          </Panel>
          <Panel title="Visitors by country">
            <StackBar parts={snapshot.countries.map((c) => ({ label: c.country, value: c.share }))} />
          </Panel>
        </div>
      ) : null}
      {!has("bounce_rate") ? <p className="text-[12px] text-muted">Engagement metrics appear once a site passes 10k monthly visits.</p> : null}
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { g2: "G2", trustpilot: "Trustpilot", chrome_web_store: "Chrome Web Store", app_store: "App Store", google_play: "Google Play" };

export function ReviewsTab({ reviews }: { reviews: ReviewsDetail | null }) {
  const entries = Object.entries(reviews ?? {}).filter((e): e is [string, NonNullable<(typeof e)[1]>] => Boolean(e[1]));
  if (!entries.length) return <Empty>No reviews found on G2, Trustpilot, Chrome Web Store, App Store or Google Play.</Empty>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {entries.map(([source, r]) => (
        <Panel key={source} title={SOURCE_LABEL[source] ?? source} action={<Badge tone="neutral">{int(r.count)} reviews</Badge>}>
          <div className="flex items-end gap-3">
            <span className="font-display text-[30px] text-ink">{r.rating.toFixed(1)}</span>
            <span className="pb-1.5 text-[16px] text-accent" aria-label={`${r.rating} out of 5 stars`}>
              {"★".repeat(Math.round(r.rating))}
              <span className="text-faint">{"★".repeat(5 - Math.round(r.rating))}</span>
            </span>
          </div>
          {r.history.length > 1 ? (
            <div className="mt-3">
              <p className="mb-1 text-[12px] text-muted">Review count, last {r.history.length} months</p>
              <LineChart series={[{ name: "Reviews", values: r.history.map((h) => h.count) }]} labels={r.history.map((h) => mon(h.month))} height={100} />
            </div>
          ) : null}
          <table className="mt-3 w-full text-[13px]">
            <tbody>
              {r.products.map((p) => (
                <tr key={p.name} className="border-t border-line/60">
                  <td className="py-2 text-ink">{p.name}</td>
                  <td className="py-2 text-right tabular">{p.rating.toFixed(1)} ★</td>
                  <td className="py-2 text-right tabular text-muted">{int(p.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}
