import type { Metadata } from "next";
import Link from "next/link";
import * as repo from "@founders/core/repo";
import { Badge, Card, cn } from "@founders/ui";
import { getCtx } from "@/lib/session";
import { NetworkSources } from "@/components/integrations/NetworkSources";

export const metadata: Metadata = { title: "Team Network" };

type P = { searchParams: Promise<{ tab?: string; list?: string }> };

const tone = (s: number) => (s >= 60 ? "positive" : s >= 30 ? "warning" : "neutral") as "positive" | "warning" | "neutral";

/** Team network (plan 13.2): deduped people, reachable companies, warm paths into a list, your sources. */
export default async function NetworkPage({ searchParams }: P) {
  const sp = await searchParams;
  const tab = sp.tab ?? "people";
  const ctx = await getCtx();
  const [members, sources, lists] = await Promise.all([repo.networkMembers(ctx), repo.getMyNetworkSources(ctx), repo.getLists(ctx, "COMPANY")]);
  const total = members.reduce((a, m) => a + m.connections, 0);
  const tabs = [
    ["people", "People"],
    ["companies", "Companies"],
    ["paths", "Warm paths"],
    ["sources", "Your sources"],
  ] as const;
  const listId = sp.list ?? lists.find((l) => !l.system)?.id;
  const [people, companies, paths] = await Promise.all([
    tab === "people" ? repo.networkPeople(ctx, { limit: 200 }) : [],
    tab === "companies" ? repo.networkCompanies(ctx, { limit: 200 }) : [],
    tab === "paths" && listId ? repo.warmPaths(ctx, { listId }) : [],
  ]);
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold">Team Network</h1>
        <p className="text-[13px] text-muted">
          {total ? `${total.toLocaleString()} connections across ${members.filter((m) => m.connections).length} teammate(s), deduped into one map.` : "No one on the team has connected a source yet."}
        </p>
      </div>
      <div className="mb-4 flex gap-1 border-b border-line text-[13px]" role="tablist">
        {tabs.map(([id, label]) => (
          <Link key={id} href={`/network?tab=${id}`} role="tab" aria-selected={tab === id} className={cn("-mb-px border-b-2 px-3 py-2", tab === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}>
            {label}
          </Link>
        ))}
      </div>

      {tab === "people" ? (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Who knows them</th>
                <th className="px-4 py-2.5 text-right font-medium">Strength</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.person_id} className="border-b border-line/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/people/${p.person_id}`} className="text-ink hover:text-accent">{p.full_name}</Link>
                    <span className="block text-[12px] text-muted">{p.current_title ?? ""}</span>
                  </td>
                  <td className="px-4 py-2.5">{p.company_id ? <Link href={`/companies/${p.company_id}`} className="hover:text-accent">{p.company_name}</Link> : "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{p.teammates.map((t) => t.name).join(", ")}</td>
                  <td className="px-4 py-2.5 text-right"><Badge tone={tone(p.strength)}>{Math.round(p.strength)}</Badge></td>
                </tr>
              ))}
              {!people.length ? <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Connect a source under “Your sources” to build the map.</td></tr> : null}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === "companies" ? (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 text-right font-medium">People you know</th>
                <th className="px-4 py-2.5 text-right font-medium">Teammates</th>
                <th className="px-4 py-2.5 text-right font-medium">Best strength</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.company_id} className="border-b border-line/60">
                  <td className="px-4 py-2.5"><Link href={`/companies/${c.company_id}`} className="text-ink hover:text-accent">{c.name}</Link> <span className="text-[12px] text-faint">{c.domain}</span></td>
                  <td className="px-4 py-2.5 text-right tabular">{c.people}</td>
                  <td className="px-4 py-2.5 text-right tabular">{c.teammates}</td>
                  <td className="px-4 py-2.5 text-right"><Badge tone={tone(c.best_strength)}>{Math.round(c.best_strength)}</Badge></td>
                </tr>
              ))}
              {!companies.length ? <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No reachable companies yet.</td></tr> : null}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === "paths" ? (
        <div className="flex flex-col gap-3">
          <form className="flex items-center gap-2 text-[13px]" action="/network">
            <input type="hidden" name="tab" value="paths" />
            <label htmlFor="list" className="text-muted">Warm paths into</label>
            <select id="list" name="list" defaultValue={listId} className="h-8 rounded-md border border-line bg-white/[0.03] px-2 text-ink">
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="h-8 rounded-md border border-line px-3 text-ink hover:border-accent/50">Show</button>
          </form>
          {paths.map((w) => (
            <Card key={w.company_id} className="p-4 text-[13px]">
              <Link href={`/companies/${w.company_id}`} className="font-medium text-ink hover:text-accent">{w.company_name}</Link>
              <ul className="mt-2 flex flex-col gap-1">
                {w.paths.map((p) => (
                  <li key={`${p.teammate_id}-${p.person_id}`} className="flex flex-wrap items-center gap-2">
                    <span className="text-ink">{p.teammate}</span>
                    <span className="text-faint">→</span>
                    <Link href={`/people/${p.person_id}`} className="hover:text-accent">{p.person}</Link>
                    <span className="text-muted">{p.title ?? ""}</span>
                    <Badge tone={tone(p.strength)}>{Math.round(p.strength)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {!paths.length ? <p className="text-[13px] text-muted">No warm paths into this list yet.</p> : null}
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="flex max-w-3xl flex-col gap-4">
          <NetworkSources sources={sources} />
          <Card className="divide-y divide-line text-[13px]">
            <p className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-faint">Teammates</p>
            {members.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="text-ink">{m.name}</span>
                {m.sources.map((s) => <Badge key={s.provider} tone="neutral">{s.provider.replace("_CSV", "").toLowerCase()}</Badge>)}
                <span className="ml-auto text-muted">{m.connections.toLocaleString()} connections</span>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
