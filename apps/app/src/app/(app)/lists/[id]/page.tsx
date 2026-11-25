import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { encodeFilter } from "@founders/core/filters";
import * as repo from "@founders/core/repo";
import { buttonClass, Card, COLUMNS } from "@founders/ui";
import { appLink, PRODUCT_PATH } from "@/components/grid/links";
import { getCtx } from "@/lib/session";
import { DeleteListButton, ImportBox, RemoveButton } from "../ListClient";

export const metadata: Metadata = { title: "List" };

async function resolveLines(entityType: string, lines: string[]) {
  "use server";
  await getCtx();
  const inputs = lines.map((l) => (l.includes("linkedin") ? { linkedin_url: l } : l.includes("@") ? { email: l } : /\.[a-z]{2,}/i.test(l) && !l.includes(" ") ? { domain: l, name: l } : { name: l }));
  const res =
    entityType === "COMPANY" ? await repo.resolveCompanies(inputs) : entityType === "PERSON" ? await repo.resolvePeople(inputs) : await repo.resolveInvestors(inputs);
  const ids = res.map((r) => ("company_id" in r ? r.company_id : "person_id" in r ? r.person_id : r.investor_id)).filter((x): x is string => Boolean(x));
  const names = await repo.getEntityNames(ids);
  return res.map((r, i) => {
    const id = "company_id" in r ? r.company_id : "person_id" in r ? r.person_id : r.investor_id;
    return { input: lines[i] ?? "", id, name: id ? (names[id] ?? null) : null };
  });
}

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  let data;
  try {
    data = await repo.getListItems(ctx, id, { limit: 500 });
  } catch (e) {
    if (e instanceof repo.NotFoundError) notFound();
    throw e;
  }
  const product = repo.ENTITY_PRODUCT[data.list.entity_type];
  const cols = COLUMNS[product].slice(0, 7);
  const gridHref = `${PRODUCT_PATH[product]}?f=${encodeFilter({ kind: "group", op: "AND", children: [{ kind: "condition", field: "list", operator: "in_list", value: id }] })}`;
  const resolve = resolveLines.bind(null, data.list.entity_type);
  return (
    <div className="p-6">
      <div className="mb-1 text-[12px] text-muted">
        <Link href="/lists" className="hover:text-ink">
          Lists
        </Link>{" "}
        / {data.list.name}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">{data.list.name}</h1>
        <span className="text-[13px] text-muted">{data.total.toLocaleString()} items</span>
        <div className="ml-auto flex gap-2">
          <Link href={gridHref} className={buttonClass("secondary", "sm")}>
            Open in grid (filter, export, bulk edit)
          </Link>
          {!data.list.system ? <DeleteListButton listId={id} /> : null}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                {cols.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 font-medium">
                    {c.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-line/60">
                  {cols.map((c) => (
                    <td key={c.key} className="max-w-[260px] overflow-hidden whitespace-nowrap px-3 py-2.5">
                      {c.render(r, appLink)}
                    </td>
                  ))}
                  <td className="px-3 text-right">
                    <RemoveButton listId={id} id={String(r.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.rows.length ? <p className="p-10 text-center text-[13px] text-muted">This list is empty. Add records from any grid or profile, or import below.</p> : null}
        </Card>
        <Card className="h-fit p-4">
          <h2 className="mb-2 text-[14px] font-medium">Import</h2>
          <ImportBox listId={id} entityType={data.list.entity_type} resolve={resolve} />
        </Card>
      </div>
    </div>
  );
}
