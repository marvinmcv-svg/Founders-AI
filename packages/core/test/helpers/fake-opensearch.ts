/**
 * In-memory stand-in for the slice of OpenSearch 2.x the backend uses (index CRUD, _bulk, _search
 * with bool/term/terms/range/exists/wildcard/prefix, sort, from/size, track_total_hits). It lets the
 * parity tests compare the DSL compiler with the SQL compiler on real seeded rows. Not production code.
 */
import type { OsFetch } from "../../src/search";

type Doc = Record<string, unknown>;
type Q = Record<string, unknown>;

const vals = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const DAY = 86_400_000;
function time(v: unknown): number {
  const s = String(v);
  const m = /^now\/d-(\d+)d$/.exec(s);
  if (m) {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Number(m[1]) * DAY;
  }
  return Date.parse(s);
}
const cmp = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? a - b : typeof b === "string" && /^(now|\d{4}-\d{2}-\d{2})/.test(b) ? time(a) - time(b) : Number(a) - Number(b));
const glob = (pattern: string, ci: boolean, prefixOnly = false) => {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\" && i + 1 < pattern.length) re += pattern[++i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (ch === "*" && !prefixOnly) re += ".*";
    else if (ch === "?" && !prefixOnly) re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}${prefixOnly ? "[\\s\\S]*" : ""}$`, ci ? "is" : "s");
};

export function matches(q: Q, doc: Doc): boolean {
  const [kind, body] = Object.entries(q)[0] as [string, Q];
  switch (kind) {
    case "match_all":
      return true;
    case "match_none":
      return false;
    case "bool": {
      const all = [...((body.filter as Q[]) ?? []), ...((body.must as Q[]) ?? [])];
      if (!all.every((x) => matches(x, doc))) return false;
      if (((body.must_not as Q[]) ?? []).some((x) => matches(x, doc))) return false;
      const should = (body.should as Q[]) ?? [];
      if (should.length) return should.filter((x) => matches(x, doc)).length >= Number(body.minimum_should_match ?? 1);
      return true;
    }
    case "term": {
      const [k, spec] = Object.entries(body)[0]!;
      const want = spec && typeof spec === "object" ? (spec as Q).value : spec;
      const ci = !!(spec && typeof spec === "object" && (spec as Q).case_insensitive);
      return vals(doc[k]).some((v) => (ci && typeof v === "string" ? v.toLowerCase() === String(want).toLowerCase() : v === want || (typeof v === "number" && v === Number(want))));
    }
    case "terms": {
      const [k, list] = Object.entries(body)[0]! as [string, unknown[]];
      return vals(doc[k]).some((v) => list.includes(v as never));
    }
    case "range": {
      const [k, r] = Object.entries(body)[0]! as [string, Q];
      return vals(doc[k]).some((v) => (r.gte === undefined || cmp(v, r.gte) >= 0) && (r.lte === undefined || cmp(v, r.lte) <= 0) && (r.gt === undefined || cmp(v, r.gt) > 0) && (r.lt === undefined || cmp(v, r.lt) < 0));
    }
    case "exists":
      return vals(doc[String(body.field)]).length > 0;
    case "wildcard":
    case "prefix": {
      const [k, spec] = Object.entries(body)[0]! as [string, Q];
      const re = glob(String(spec.value), !!spec.case_insensitive, kind === "prefix");
      return vals(doc[k]).some((v) => typeof v === "string" && re.test(v));
    }
    default:
      throw new Error(`fake-opensearch: unsupported query ${kind}`);
  }
}

function sorter(sort: Q[]) {
  return (a: Doc, b: Doc) => {
    for (const s of sort) {
      const [k, spec] = Object.entries(s)[0]! as [string, Q];
      const av = vals(a[k])[0];
      const bv = vals(b[k])[0];
      if (av === undefined && bv === undefined) continue;
      if (av === undefined) return 1; // missing: _last
      if (bv === undefined) return -1;
      const c = typeof av === "number" ? (av as number) - (bv as number) : String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      if (c) return spec.order === "desc" ? -c : c;
    }
    return 0;
  };
}

export class FakeOpenSearch {
  readonly indices = new Map<string, Map<string, Doc>>();
  readonly requests: { method: string; path: string; body?: string }[] = [];

  fetch: OsFetch = async (url, init) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? init.body : undefined;
    this.requests.push({ method, path: u.pathname, body });
    const parts = u.pathname.split("/").filter(Boolean);
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    if (parts.length === 1 && parts[0] === "_bulk") {
      const lines = (body ?? "").split("\n").filter(Boolean);
      const items: Q[] = [];
      for (let i = 0; i < lines.length; i++) {
        const action = JSON.parse(lines[i]!) as Q;
        if (action.index) {
          const meta = action.index as { _index: string; _id: string };
          const doc = JSON.parse(lines[++i]!) as Doc;
          if (!this.indices.has(meta._index)) return json(404, { error: "no such index" });
          this.indices.get(meta._index)!.set(meta._id, doc);
          items.push({ index: { status: 201 } });
        } else if (action.delete) {
          const meta = action.delete as { _index: string; _id: string };
          const existed = this.indices.get(meta._index)?.delete(meta._id);
          items.push({ delete: { status: existed ? 200 : 404 } });
        }
      }
      return json(200, { errors: false, items });
    }
    const [index, op] = parts as [string, string | undefined];
    if (!op) {
      if (method === "HEAD") return new Response(null, { status: this.indices.has(index) ? 200 : 404 });
      if (method === "PUT") {
        if (this.indices.has(index)) return json(400, { error: "resource_already_exists_exception" });
        this.indices.set(index, new Map());
        return json(200, { acknowledged: true });
      }
      if (method === "DELETE") return this.indices.delete(index) ? json(200, { acknowledged: true }) : json(404, { error: "index_not_found_exception" });
    }
    if (op === "_refresh") return json(200, {});
    if (op === "_search") {
      const docs = this.indices.get(index);
      if (!docs) return json(404, { error: "index_not_found_exception" });
      const s = JSON.parse(body ?? "{}") as { query: Q; sort: Q[]; from: number; size: number; track_total_hits: number };
      const hit = [...docs.values()].filter((d) => matches(s.query, d)).sort(sorter(s.sort));
      return json(200, { hits: { total: { value: Math.min(hit.length, s.track_total_hits), relation: "eq" }, hits: hit.slice(s.from, s.from + s.size).map((d) => ({ _id: d.id })) } });
    }
    return json(400, { error: `fake-opensearch: unsupported ${method} ${u.pathname}` });
  };
}
