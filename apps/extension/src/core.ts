/**
 * Pure logic shared by the side panel, background worker and tests: which entity the active tab is
 * about, the API client (public API + /api/ext helpers), and the card view-model.
 * The extension only ever reads the active tab's URL — never page content (plan 13.3, H11).
 */

export const DEFAULT_APP_URL = "https://app.foundersscz.com";

export type Settings = { apiKey: string; appUrl: string };
export type Target = { kind: "company"; domain: string } | { kind: "person"; linkedinUrl: string } | { kind: "linkedin_company"; slug: string } | { kind: "none"; reason: string };

/** Sites whose domain is never "the company you're looking at". */
const NOT_COMPANIES = /(^|\.)(google|bing|duckduckgo|youtube|facebook|instagram|x|twitter|tiktok|reddit|github|gitlab|medium|substack|wikipedia|notion|slack|zoom|gmail|outlook|live|office|microsoft|apple|amazon|crunchbase|pitchbook|chrome|vercel|localhost)\.[a-z.]+$|^localhost$/;

export function targetFromUrl(raw: string | undefined): Target {
  if (!raw) return { kind: "none", reason: "No page open" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: "none", reason: "Not a web page" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { kind: "none", reason: "Not a web page" };
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (/(^|\.)linkedin\.com$/.test(host)) {
    const m = /^\/(in|company)\/([^/?#]+)/.exec(u.pathname);
    if (!m) return { kind: "none", reason: "Open a LinkedIn profile or company page" };
    const slug = decodeURIComponent(m[2] as string).toLowerCase();
    return m[1] === "in" ? { kind: "person", linkedinUrl: `https://www.linkedin.com/in/${slug}` } : { kind: "linkedin_company", slug };
  }
  if (NOT_COMPANIES.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return { kind: "none", reason: `${host} isn't a company website` };
  return { kind: "company", domain: host };
}

export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

export function client(s: Settings, fetcher: Fetcher) {
  const base = s.appUrl.replace(/\/+$/, "");
  const call = async (path: string, init: { method?: string; body?: unknown } = {}): Promise<Obj> => {
    const res = await fetcher(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: { "X-API-Key": s.apiKey, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const body = obj(await res.json().catch(() => ({})));
    if (res.status === 401) throw new ApiError(401, "Your API key was rejected — update it in the extension settings.");
    if (res.status === 402) throw new ApiError(402, "Your workspace is out of API credits.");
    if (res.status >= 400) throw new ApiError(res.status, String(body.detail ?? body.error ?? `Request failed (${res.status})`));
    return body;
  };
  return {
    config: () => call("/api/ext/config"),
    lookupCompany: async (domain: string) => obj(arr((await call("/api/v1/companies", { method: "POST", body: { items: [{ domain }] } })).items)[0]?.match) as Obj | null,
    lookupPerson: async (linkedinUrl: string) => obj(arr((await call("/api/v1/people", { method: "POST", body: { items: [{ linkedin_url: linkedinUrl }] } })).items)[0]?.match) as Obj | null,
    lists: async (kind: "company" | "people") => arr((await call(`/api/v1/lists?type=${kind}`)).items).filter((l) => !l.system),
    addToList: (listId: string, kind: "companies" | "people", id: string) => call(`/api/v1/lists/${kind}/${encodeURIComponent(listId)}`, { method: "PATCH", body: { add: [id] } }),
    like: (id: string) => call("/api/ext/like", { method: "POST", body: { id } }),
    push: (id: string) => call("/api/ext/push", { method: "POST", body: { id } }),
  };
}

export type Card = {
  kind: "company" | "person";
  id: string;
  title: string;
  subtitle: string;
  chips: string[];
  kpis: { label: string; value: string; delta?: number | null }[];
  people: string[];
  appPath: string;
};

const money = (v: unknown) => {
  const n = Number(v);
  if (!v || !Number.isFinite(n)) return "—";
  return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
};
const int = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-US"));

/** Company card (plan 13.3): logo/name, rank, one-liner, HQ, founded, model chips, raised, key people, team size with Δ. */
export function companyCard(c: Obj): Card {
  const hq = obj(c.hq);
  const funding = obj(c.funding);
  const emp = obj(obj(c.traction_metrics).employee_count);
  return {
    kind: "company",
    id: String(c.id),
    title: String(c.organization_name ?? c.name ?? ""),
    subtitle: String(c.tagline ?? c.description ?? ""),
    chips: [
      (c.organization_rank ?? c.rank) ? `Rank ${int(c.organization_rank ?? c.rank)}` : "",
      [hq.city, hq.country].filter(Boolean).join(", "),
      c.founded_year ? `Founded ${String(c.founded_year)}` : "",
      String(c.growth_stage ?? ""),
      ...(Array.isArray(c.business_models) ? (c.business_models as string[]).slice(0, 2) : []),
    ].filter(Boolean),
    kpis: [
      { label: "Team size", value: int(c.employee_count), delta: (obj(emp["3mo"]).percentage as number | null) ?? null },
      { label: "Raised", value: money(funding.total_funding_usd) },
      { label: "Last round", value: funding.last_funding_type ? `${String(funding.last_funding_type)} · ${money(funding.last_funding_usd)}` : "—" },
      { label: "Est. revenue", value: money(c.revenue_estimate_usd) },
    ],
    people: arr(c.founders).slice(0, 4).map((f) => `${String(f.full_name)}${f.title ? ` · ${String(f.title)}` : ""}`),
    appPath: `/companies/${String(c.id)}`,
  };
}

export function personCard(p: Obj): Card {
  const company = obj(p.current_company);
  return {
    kind: "person",
    id: String(p.id),
    title: String(p.full_name ?? ""),
    subtitle: String(p.headline ?? [p.current_title, company.name ?? p.current_company_name].filter(Boolean).join(" · ")),
    chips: [String(p.location ?? p.country ?? ""), String(p.seniority ?? ""), ...(Array.isArray(p.highlights) ? (p.highlights as string[]).slice(0, 2) : [])].filter(Boolean),
    kpis: [
      { label: "Current role", value: String(p.current_title ?? "—") },
      { label: "Company", value: String(company.name ?? p.current_company_name ?? "—") },
    ],
    people: [],
    appPath: `/people/${String(p.id)}`,
  };
}
