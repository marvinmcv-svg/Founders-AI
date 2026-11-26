/** Entity extraction, step 2: resolve candidate mentions (see ../extract.ts) to platform IDs. */
import { sql } from "drizzle-orm";
import { findMentions, pickNonOverlapping, type Resolved } from "../extract";
import { rawQuery as q } from "./entities";

const arr = (xs: string[]) => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;

export type ExtractedEntity = { type: Resolved["type"]; id: string; name: string; mention: string; start: number; end: number; confidence: number; method: string };

export async function extractEntities(text: string, types: Resolved["type"][] = ["company", "investor", "person"]): Promise<ExtractedEntity[]> {
  const mentions = findMentions(text);
  if (!mentions.length) return [];
  const by = (k: string) => [...new Set(mentions.filter((m) => m.kind === k).map((m) => m.key))];
  const names = by("name");
  const domains = by("domain");
  const emails = by("email");
  const linkedins = by("linkedin");
  const cands: Resolved[] = [];
  const add = (key: string, kind: string, type: Resolved["type"], id: string, name: string, confidence: number) => {
    for (const m of mentions) if (m.kind === kind && m.key === key) cands.push({ mention: m, type, id, name, confidence });
  };

  if (types.includes("company")) {
    if (domains.length) for (const r of await q<{ id: string; name: string; d: string }>(sql`SELECT id, name, domain AS d FROM companies WHERE deleted_at IS NULL AND domain = ANY(${arr(domains)})`)) add(r.d, "domain", "company", r.id, r.name, 0.99);
    if (names.length) for (const r of await q<{ id: string; name: string; k: string }>(sql`SELECT DISTINCT ON (lower(name)) id, name, lower(name) AS k FROM companies WHERE deleted_at IS NULL AND lower(name) = ANY(${arr(names)}) ORDER BY lower(name), rank ASC`)) add(r.k, "name", "company", r.id, r.name, r.k.includes(" ") ? 0.85 : 0.7);
  }
  if (types.includes("investor")) {
    if (domains.length) for (const r of await q<{ id: string; name: string; d: string }>(sql`SELECT id, name, domain AS d FROM investors WHERE deleted_at IS NULL AND domain = ANY(${arr(domains)})`)) add(r.d, "domain", "investor", r.id, r.name, 0.99);
    if (names.length) for (const r of await q<{ id: string; name: string; k: string }>(sql`SELECT DISTINCT ON (lower(name)) id, name, lower(name) AS k FROM investors WHERE deleted_at IS NULL AND lower(name) = ANY(${arr(names)}) ORDER BY lower(name), investments_count DESC`)) add(r.k, "name", "investor", r.id, r.name, r.k.includes(" ") ? 0.85 : 0.7);
  }
  if (types.includes("person")) {
    if (linkedins.length) for (const r of await q<{ id: string; name: string; k: string }>(sql`SELECT id, full_name AS name, lower(rtrim(linkedin_url, '/')) AS k FROM people WHERE lower(rtrim(linkedin_url, '/')) = ANY(${arr(linkedins)})`)) add(r.k, "linkedin", "person", r.id, r.name, 1);
    if (emails.length) for (const r of await q<{ id: string; name: string; k: string }>(sql`SELECT p.id, p.full_name AS name, lower(e.email) AS k FROM person_emails e JOIN people p ON p.id = e.person_id WHERE lower(e.email) = ANY(${arr(emails)})`)) add(r.k, "email", "person", r.id, r.name, 0.95);
    // Single-token person names are too ambiguous to resolve without context.
    const multi = names.filter((n) => n.includes(" "));
    if (multi.length) for (const r of await q<{ id: string; name: string; k: string }>(sql`SELECT DISTINCT ON (lower(full_name)) id, full_name AS name, lower(full_name) AS k FROM people WHERE deleted_at IS NULL AND lower(full_name) = ANY(${arr(multi)}) ORDER BY lower(full_name), followers DESC`)) add(r.k, "name", "person", r.id, r.name, 0.75);
  }
  return pickNonOverlapping(cands).map((r) => ({ type: r.type, id: r.id, name: r.name, mention: r.mention.text, start: r.mention.start, end: r.mention.end, confidence: r.confidence, method: r.mention.kind }));
}
