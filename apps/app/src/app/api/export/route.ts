import { decodeFilter, PRODUCTS, validateFilter, emptyFilter, type Product } from "@founders/core/filters";
import { csvCell } from "@founders/core/format";
import { EXPORT_MAX_ROWS } from "@founders/core/limits";
import { pageCost } from "@founders/core/pricing";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

/** CSV export (plan 7.3 / 14.4): credit-costed, CSV-injection safe, max EXPORT_MAX_ROWS rows. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  const url = new URL(req.url);
  const product = url.searchParams.get("product") as Product;
  if (!(PRODUCTS as readonly string[]).includes(product)) return new Response("Unknown product", { status: 400 });
  let rows: repo.Row[];
  const ids = url.searchParams.get("ids");
  if (ids) rows = await repo.getRowsByIds(product, ids.split(",").slice(0, EXPORT_MAX_ROWS));
  else {
    const v = validateFilter(product, decodeFilter(url.searchParams.get("f")));
    const [field, dir] = (url.searchParams.get("s") ?? "").split(":");
    rows = (await repo.searchEntities(product, { filter: v.ok ? v.filter : emptyFilter(), sort: field ? { field, dir: dir === "asc" ? "asc" : "desc" } : null, q: url.searchParams.get("q"), limit: EXPORT_MAX_ROWS, orgId: ctx.orgId })).rows;
  }
  try {
    await repo.charge({ orgId: ctx.orgId, actorType: "user", actorId: ctx.userId, surface: "APP", operation: `export.${product}`, credits: pageCost(rows.length), matched: rows.length > 0 });
  } catch (e) {
    if (e instanceof repo.InsufficientCreditsError) return new Response(e.message, { status: 402 });
    throw e;
  }
  await repo.audit(ctx, `export.${product}`, String(rows.length));
  const skip = new Set(["founders", "investors", "provenance", "embedding"]);
  const cols = rows[0] ? Object.keys(rows[0]).filter((k) => !skip.has(k)) : ["id"];
  const flat = (r: repo.Row, k: string) => {
    const v = r[k];
    return v && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
  };
  const extra = product === "companies" ? ["founders"] : product === "funding_rounds" ? ["investors"] : [];
  const header = [...cols, ...extra];
  const lines = [header.join(",")];
  for (const r of rows) {
    const vals = cols.map((k) => csvCell(flat(r, k)));
    for (const e of extra) vals.push(csvCell(((r[e] as { name: string }[] | undefined) ?? []).map((x) => x.name)));
    lines.push(vals.join(","));
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="founders-${product}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
