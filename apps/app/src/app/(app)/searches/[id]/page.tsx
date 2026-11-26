import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { describeFilter, encodeFilter, PRODUCT_META } from "@founders/core/filters";
import * as repo from "@founders/core/repo";
import { Badge, buttonClass, Card, cn, COLUMNS } from "@founders/ui";
import { appLink, PRODUCT_PATH } from "@/components/grid/links";
import { getCtx } from "@/lib/session";
import { AlertSettings, MarkRead, SearchRowActions } from "../SearchClient";

export const metadata: Metadata = { title: "Saved search" };

export default async function SearchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const view = (await searchParams).view === "all" ? "all" : "new";
  const ctx = await getCtx();
  let res;
  try {
    res = await repo.getSavedSearchResults(ctx, id, { newOnly: view === "new", limit: 200 });
  } catch (e) {
    if (e instanceof repo.NotFoundError) notFound();
    throw e;
  }
  const s = res.search;
  const newSet = new Set(res.newIds);
  const cols = COLUMNS[s.product].slice(0, 7);
  const gridHref = `${PRODUCT_PATH[s.product]}?f=${encodeFilter(s.filter_ast)}${s.sort ? `&s=${s.sort.field}:${s.sort.dir}` : ""}`;
  return (
    <div className="p-6">
      <MarkRead id={id} />
      <div className="mb-1 text-[12px] text-muted">
        <Link href="/searches" className="hover:text-ink">
          Searches
        </Link>{" "}
        / {s.name}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">{s.name}</h1>
        <Badge tone="neutral">{PRODUCT_META[s.product].label}</Badge>
        <div className="ml-auto flex items-center gap-3">
          <SearchRowActions id={id} />
          <Link href={gridHref} className={buttonClass("secondary", "sm")}>
            Open in grid
          </Link>
        </div>
      </div>
      <p className="mb-3 text-[13px] text-muted">{describeFilter(s.product, s.filter_ast) || "No filters"}</p>
      <div className="mb-4">
        <AlertSettings id={id} cadence={s.alert_cadence} channels={(s.channels as string[] | null) ?? ["in_app", "email"]} canEdit={repo.canWrite(ctx)} />
      </div>
      <div className="mb-3 flex gap-1 text-[13px]">
        <Link href={`/searches/${id}`} className={cn("rounded-full px-3 py-1", view === "new" ? "bg-white/[0.1] text-ink" : "text-muted")}>
          New since last read
        </Link>
        <Link href={`/searches/${id}?view=all`} className={cn("rounded-full px-3 py-1", view === "all" ? "bg-white/[0.1] text-ink" : "text-muted")}>
          All results
        </Link>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="w-16 px-3 py-2.5" />
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2.5 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={String(r.id)} className={cn("border-b border-line/60", newSet.has(String(r.id)) && "bg-accent-soft/40")}>
                <td className="px-3">{newSet.has(String(r.id)) ? <Badge>New</Badge> : null}</td>
                {cols.map((c) => (
                  <td key={c.key} className="max-w-[260px] overflow-hidden whitespace-nowrap px-3 py-2.5">
                    {c.render(r, appLink)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!res.rows.length ? <p className="p-10 text-center text-[13px] text-muted">{view === "new" ? "Nothing new since you last looked." : "No results."}</p> : null}
      </Card>
      <p className="mt-2 text-[12px] text-faint">{res.total.toLocaleString()} {view === "new" ? "new" : "total"} results</p>
    </div>
  );
}
