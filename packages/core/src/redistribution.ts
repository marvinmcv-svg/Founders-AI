/**
 * Redistribution filter (plan Rule 10 / checklist "field provenance + redistribution filter on
 * API / MCP / export / bulk"): fields whose provenance says `redistributable: false` never leave the
 * platform. `"*": { redistributable: false }` withholds the whole record.
 */
type Prov = Record<string, { redistributable?: boolean }> | null | undefined;
type Row = Record<string, unknown>;

export function blockedFields(prov: Prov): Set<string> {
  const out = new Set<string>();
  if (!prov) return out;
  for (const [field, p] of Object.entries(prov)) if (p && p.redistributable === false) out.add(field);
  return out;
}

export function redistributable<T extends Row>(row: T): T {
  const deny = blockedFields(row.provenance as Prov);
  const copy: Row = { ...row };
  delete copy.provenance;
  delete copy.embedding;
  delete copy.deleted_at;
  if (deny.has("*")) return {} as T;
  for (const f of deny) delete copy[f];
  return copy as T;
}
