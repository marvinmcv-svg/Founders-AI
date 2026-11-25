import { decodeFilter, validateFilter, emptyFilter, type Product } from "@founders/core/filters";
import { APP_GRID_PAGE_SIZE } from "@founders/core/limits";
import * as repo from "@founders/core/repo";
import { canWrite } from "@founders/core/repo";
import { getCtx } from "@/lib/session";
import { EntityGrid } from "./EntityGrid";

export type GridSearchParams = Promise<{ f?: string; s?: string; q?: string }>;

/** Server-renders the first page (so shared URLs restore state instantly), then hands off to the client grid. */
export async function GridPage({ product, searchParams }: { product: Product; searchParams: GridSearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const decoded = decodeFilter(sp.f);
  const v = validateFilter(product, decoded);
  const filter = v.ok ? v.filter : emptyFilter();
  const [field, dir] = (sp.s ?? "").split(":");
  const sort = field ? { field, dir: dir === "asc" ? ("asc" as const) : ("desc" as const) } : null;
  const q = sp.q ?? "";
  const [res, lists, statuses] = await Promise.all([
    repo.searchEntities(product, { filter, sort, q, limit: APP_GRID_PAGE_SIZE, orgId: ctx.orgId }),
    repo.getLists(ctx),
    repo.getStatuses(ctx),
  ]);
  const rowStatuses = await repo.getEntityStatuses(ctx, res.rows.map((r) => String(r.id)));
  return (
    <EntityGrid
      product={product}
      initial={{ ...res, statuses: rowStatuses, filter, sort, q }}
      lists={lists.map((l) => ({ id: l.id, name: l.name, entity_type: l.entity_type }))}
      statuses={statuses}
      canWrite={canWrite(ctx)}
    />
  );
}
