import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_META } from "@founders/core/filters";
import * as repo from "@founders/core/repo";
import { Badge, Card } from "@founders/ui";
import { getCtx } from "@/lib/session";
import { SearchRowActions } from "./SearchClient";

export const metadata: Metadata = { title: "Saved searches" };

export default async function Searches() {
  const ctx = await getCtx();
  const searches = await repo.getSavedSearches(ctx);
  return (
    <div className="p-6">
      <h1 className="text-[22px] font-semibold">Saved searches</h1>
      <p className="mb-5 text-[13px] text-muted">Re-run as data lands. "New" counts what arrived since you last opened each search.</p>
      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="px-4 py-2.5 font-medium">Search</th>
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 text-right font-medium">New results</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Alerts</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {searches.map((s) => (
              <tr key={s.id} className="border-b border-line/60 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <Link href={`/searches/${s.id}`} className="text-ink hover:text-accent">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{PRODUCT_META[s.product].label}</td>
                <td className="px-4 py-3 text-right">{s.new_results ? <Badge>+{s.new_results}</Badge> : <span className="text-faint">0</span>}</td>
                <td className="px-4 py-3 text-right tabular text-muted">{(s.total_results ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 capitalize text-muted">{s.alert_cadence.toLowerCase()}</td>
                <td className="px-4 py-3 text-muted">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-muted">{s.owner_name}</td>
                <td className="px-4 py-3 text-right">
                  <SearchRowActions id={s.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!searches.length ? <p className="p-10 text-center text-[13px] text-muted">No saved searches yet — build a filter in any grid and click Save Search.</p> : null}
      </Card>
    </div>
  );
}
