import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { int, shortDate, usd } from "@founders/core/format";
import { taxonomyName } from "@founders/core/taxonomy";
import * as repo from "@founders/core/repo";
import { Badge, Chip, Favicon, StackBar } from "@founders/ui";
import { Notes, ProfileActions } from "@/components/profile/Actions";
import { Empty, KV, Metric, Panel } from "@/components/profile/bits";
import { getCtx } from "@/lib/session";

type P = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const i = await repo.getInvestor((await params).id);
  return { title: i ? String(i.name) : "Investor" };
}

const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export default async function InvestorProfile({ params }: P) {
  const { id } = await params;
  const ctx = await getCtx();
  const inv = await repo.getInvestor(id);
  if (!inv) notFound();
  const [portfolio, rounds, coinvestors, mix, statuses, entityStatus, liked, inLists, notes] = await Promise.all([
    repo.getInvestorPortfolio(id, 60),
    repo.getInvestorRounds(id, 25),
    repo.getCoInvestors(id, 12),
    repo.getInvestorStageMix(id),
    repo.getStatuses(ctx),
    repo.getEntityStatuses(ctx, [id]),
    repo.isLiked(ctx, id),
    repo.getListsContaining(ctx, id),
    repo.getNotes(ctx, id),
  ]);
  return (
    <div className="min-w-0">
      <header className="flex flex-col gap-4 border-b border-line px-6 pb-5 pt-6">
        <div className="text-[12px] text-muted">
          <Link href="/investors" className="hover:text-ink">
            Investors
          </Link>{" "}
          / {String(inv.name)}
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <Favicon name={String(inv.name)} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold">{String(inv.name)}</h1>
              <Badge tone="neutral">{String(inv.type)}</Badge>
              {arr(inv.highlights).map((h) => (
                <Badge key={h}>{h}</Badge>
              ))}
            </div>
            <p className="mt-1 max-w-3xl text-[14px] text-muted">{String(inv.description ?? "")}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip>{[inv.hq_city, inv.hq_country].filter(Boolean).join(", ")}</Chip>
              {arr(inv.target_stages).map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
              {arr(inv.geographies).map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>
          </div>
        </div>
        <ProfileActions entityName={String(inv.name)} entityType="INVESTOR" id={id} liked={liked} status={entityStatus[id] ?? null} statuses={statuses} inLists={inLists} />
      </header>
      <div className="grid gap-4 p-6">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Investments" value={int(Number(inv.investments_count))} />
          <Metric label="Leads" value={int(Number(inv.leads_count))} />
          <Metric label="Exits" value={int(Number(inv.exits_count))} />
          <Metric label="Follow-on rate" value={inv.follow_on_rate === null ? "—" : `${Math.round(Number(inv.follow_on_rate) * 100)}%`} />
          <Metric label="Unicorns" value={int(Number(inv.unicorn_count))} />
          <Metric label="AUM" value={usd(inv.aum_usd === null ? null : Number(inv.aum_usd))} sub={<span className="text-muted">Check {usd(Number(inv.check_min))}–{usd(Number(inv.check_max))}</span>} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Panel title={`Portfolio · ${portfolio.length}${portfolio.length >= 60 ? "+" : ""}`}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="py-2 font-medium">Company</th>
                  <th className="py-2 font-medium">Stage</th>
                  <th className="py-2 font-medium">First invested</th>
                  <th className="py-2 text-right font-medium">Funding</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((c) => (
                  <tr key={String(c.id)} className="border-b border-line/60">
                    <td className="py-2">
                      <Link href={`/companies/${String(c.id)}`} className="flex items-center gap-2 text-ink hover:text-accent">
                        <Favicon name={String(c.name)} /> {String(c.name)} {c.is_lead ? <Badge>Lead</Badge> : null}
                      </Link>
                    </td>
                    <td className="py-2 text-muted">{String(c.growth_stage)}</td>
                    <td className="py-2 text-muted">{shortDate(String(c.first_invested))}</td>
                    <td className="py-2 text-right tabular">{usd(Number(c.total_funding_usd) || null)}</td>
                    <td className="py-2 text-right text-muted">{String(c.operating_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!portfolio.length ? <Empty>No portfolio on record.</Empty> : null}
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="Fund profile">
              <KV
                rows={[
                  ["Type", String(inv.type)],
                  ["Founded", inv.founded_year ? String(inv.founded_year) : null],
                  ["Sectors", arr(inv.sectors).map(taxonomyName).join(", ") || null],
                  ["Target stages", arr(inv.target_stages).join(", ")],
                  ["Geographies", arr(inv.geographies).join(", ")],
                  ["Website", inv.domain ? String(inv.domain) : null],
                ]}
              />
            </Panel>
            <Panel title="Round mix">{mix.length ? <StackBar parts={mix.map((m) => ({ label: m.type, value: m.n }))} /> : <Empty>—</Empty>}</Panel>
            <Panel title="Top co-investors">
              {coinvestors.map((c) => (
                <Link key={String(c.id)} href={`/investors/${String(c.id)}`} className="flex items-center gap-2 py-1.5 text-[13px] hover:text-accent">
                  <Favicon name={String(c.name)} /> <span className="flex-1 truncate">{String(c.name)}</span>
                  <span className="text-muted">{String(c.shared_rounds)} rounds</span>
                </Link>
              ))}
              {!coinvestors.length ? <Empty>No co-investors yet.</Empty> : null}
            </Panel>
          </div>
        </div>
        <Panel title="Recent rounds">
          {rounds.map((r) => (
            <div key={String(r.id)} className="flex items-center gap-3 border-b border-line/60 py-2 text-[13px] last:border-0">
              <span className="w-28 text-muted">{shortDate(String(r.announced_date))}</span>
              <Link href={`/companies/${String(r.company_id)}`} className="flex-1 truncate text-ink hover:text-accent">
                {String(r.company_name)}
              </Link>
              <span className="w-24 text-muted">{String(r.type)}</span>
              <span className="w-24 text-right tabular">{usd(Number(r.amount_usd) || null)}</span>
              {r.investor_is_lead ? <Badge>Lead</Badge> : <span className="w-10" />}
            </div>
          ))}
        </Panel>
        <Panel title="Team notes">
          <Notes entityType="INVESTOR" id={id} notes={notes} />
        </Panel>
      </div>
    </div>
  );
}
