/**
 * Zapier app (plan 13.4): triggers "New saved-search result" and "New talent signal" (REST hooks on
 * our signed webhooks), actions "Enrich company", "Enrich person" and "Add to list".
 *
 * This is a Zapier Platform CLI app definition written against the platform's schema without
 * importing `zapier-platform-core` (the CLI provides `z` and `bundle` at runtime). Publishing needs a
 * Zapier partner account and app review (H9); `zapier push` from a build of this file.
 */

export type ZRequest = { url: string; method?: "GET" | "POST" | "PATCH" | "DELETE"; params?: Record<string, string>; body?: unknown; headers?: Record<string, string> };
export type ZResponse = { status: number; json: unknown; throwForStatus(): void };
export type Z = { request(req: ZRequest): Promise<ZResponse>; errors: { Error: new (message: string, code?: string, status?: number) => Error } };
export type Bundle = {
  authData: { api_key: string; base_url?: string };
  inputData: Record<string, unknown>;
  targetUrl?: string;
  subscribeData?: { id?: string };
  cleanedRequest?: unknown;
  meta?: { isLoadingSample?: boolean };
};

export const DEFAULT_BASE_URL = process.env.FOUNDERS_API_URL ?? "https://app.foundersscz.com/api/v1";
const base = (b: Bundle) => (b.authData.base_url || DEFAULT_BASE_URL).replace(/\/$/, "");
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

async function api(z: Z, b: Bundle, path: string, init: Omit<ZRequest, "url"> = {}): Promise<Obj> {
  const res = await z.request({ ...init, url: `${base(b)}${path}` });
  if (res.status === 401) throw new z.errors.Error("Your API key was rejected. Create a new key in Settings → API keys.", "AuthenticationError", 401);
  if (res.status === 402) throw new z.errors.Error("Your workspace is out of API credits.", "OutOfCredits", 402);
  res.throwForStatus();
  return obj(res.json);
}

/** Every request carries the key; Zapier runs this before each z.request. */
export function addApiKey(request: ZRequest, bundle: Bundle): ZRequest {
  return { ...request, headers: { ...(request.headers ?? {}), "X-API-Key": bundle.authData.api_key, "User-Agent": "FoundersAI-Zapier/1.0" } };
}

/** Saved-search product → results path slug (API #43–51). */
const SEARCH_SLUG: Record<string, string> = { companies: "companies", people: "people", investors: "investors", talent_signals: "talent", funding_rounds: "transactions" };

/* ---------------- shared REST-hook plumbing ---------------- */

const subscribe = (event: string) => async (z: Z, b: Bundle) => {
  if (!b.targetUrl) throw new z.errors.Error("Missing target URL");
  return api(z, b, "/webhooks", { method: "POST", body: { url: b.targetUrl, events: [event] } });
};
const unsubscribe = async (z: Z, b: Bundle) => {
  if (b.subscribeData?.id) await api(z, b, `/webhooks/${encodeURIComponent(b.subscribeData.id)}`, { method: "DELETE" });
  return {};
};

/* ---------------- triggers ---------------- */

const savedSearchList = {
  key: "saved_search_list",
  noun: "Saved search",
  display: { label: "List saved searches", description: "Used to pick a saved search.", hidden: true },
  operation: {
    async perform(z: Z, b: Bundle): Promise<Obj[]> {
      return arr((await api(z, b, "/searches")).items).map((s) => ({ id: s.id, name: s.name, product: s.product }));
    },
  },
};

const newSearchResult = {
  key: "new_search_result",
  noun: "Result",
  display: { label: "New Saved-Search Result", description: "Triggers when new companies, people or signals match one of your saved searches." },
  operation: {
    type: "hook",
    inputFields: [{ key: "search_id", label: "Saved search", required: true, dynamic: "saved_search_list.id.name" }],
    performSubscribe: subscribe("search.new_results"),
    performUnsubscribe: unsubscribe,
    /** One Zap run per new result, only for the chosen search. */
    async perform(_z: Z, b: Bundle): Promise<Obj[]> {
      const evt = obj(b.cleanedRequest);
      const data = obj(evt.data);
      if (String(data.search_id ?? "") !== String(b.inputData.search_id ?? "")) return [];
      return arr(data.new_items).length
        ? arr(data.new_items).map((it) => ({ ...it, search_id: data.search_id, search_name: data.name, event_id: evt.id }))
        : (Array.isArray(data.new_ids) ? (data.new_ids as string[]) : []).map((id) => ({ id, search_id: data.search_id, search_name: data.name, product: data.product, event_id: evt.id }));
    },
    /** Sample / polling fallback: the latest results of the search. */
    async performList(z: Z, b: Bundle): Promise<Obj[]> {
      const s = await api(z, b, `/searches/${encodeURIComponent(String(b.inputData.search_id))}`);
      const product = SEARCH_SLUG[String(s.product)];
      if (!product) return [];
      const res = await api(z, b, `/searches/${product}/${encodeURIComponent(String(b.inputData.search_id))}/results`, { params: { limit: "3" } });
      return arr(res.items).map((it) => ({ ...it, search_id: s.id, search_name: s.name }));
    },
    sample: { id: "com_65f0c2a91b3e4d7f8a9b0c1d", name: "Andes Pay", domain: "andespay.example", search_id: "srh_000000000000000000000001", search_name: "Seed fintech in Bolivia" },
  },
};

const newTalentSignal = {
  key: "new_talent_signal",
  noun: "Talent signal",
  display: { label: "New Talent Signal", description: "Triggers when a new talent signal (founder leaving, new company, stealth) is detected." },
  operation: {
    type: "hook",
    performSubscribe: subscribe("signal.talent"),
    performUnsubscribe: unsubscribe,
    async perform(_z: Z, b: Bundle): Promise<Obj[]> {
      const evt = obj(b.cleanedRequest);
      const data = obj(evt.data);
      return (Array.isArray(data.signal_ids) ? (data.signal_ids as string[]) : []).map((id) => ({ id, event_id: evt.id }));
    },
    async performList(z: Z, b: Bundle): Promise<Obj[]> {
      return arr((await api(z, b, "/talent", { params: { limit: "3" } })).items);
    },
    sample: { id: "sig_65f0c2a91b3e4d7f8a9b0c1d", type: "NEW_COMPANY", score: 8, summary: "Ex-CTO left to start a company in stealth" },
  },
};

/* ---------------- actions ---------------- */

const enrichCompany = {
  key: "enrich_company",
  noun: "Company",
  display: { label: "Enrich Company", description: "Find a company by domain or name and return its profile (1 credit per match; misses are free)." },
  operation: {
    inputFields: [
      { key: "domain", label: "Domain", helpText: "e.g. andespay.com" },
      { key: "name", label: "Company name" },
    ],
    async perform(z: Z, b: Bundle): Promise<Obj> {
      if (!b.inputData.domain && !b.inputData.name) throw new z.errors.Error("Enter a domain or a name", "InvalidData", 400);
      const res = await api(z, b, "/companies", { method: "POST", body: { items: [{ ...(b.inputData.domain ? { domain: String(b.inputData.domain) } : {}), ...(b.inputData.name ? { name: String(b.inputData.name) } : {}) }] } });
      const first = arr(res.items)[0] ?? {};
      return { matched: Boolean(first.match ?? first.id), ...obj(first.match ?? first) };
    },
    sample: { matched: true, id: "com_65f0c2a91b3e4d7f8a9b0c1d", name: "Andes Pay", domain: "andespay.example" },
  },
};

const enrichPerson = {
  key: "enrich_person",
  noun: "Person",
  display: { label: "Enrich Person", description: "Find a person by LinkedIn URL, email or name and return their profile (1 credit per match)." },
  operation: {
    inputFields: [
      { key: "linkedin_url", label: "LinkedIn URL" },
      { key: "email", label: "Email" },
      { key: "name", label: "Full name" },
    ],
    async perform(z: Z, b: Bundle): Promise<Obj> {
      const item: Record<string, string> = {};
      for (const k of ["linkedin_url", "email", "name"]) if (b.inputData[k]) item[k] = String(b.inputData[k]);
      if (!Object.keys(item).length) throw new z.errors.Error("Enter a LinkedIn URL, email or name", "InvalidData", 400);
      const res = await api(z, b, "/people", { method: "POST", body: { items: [item] } });
      const first = arr(res.items)[0] ?? {};
      return { matched: Boolean(first.match ?? first.id), ...obj(first.match ?? first) };
    },
    sample: { matched: true, id: "per_65f0c2a91b3e4d7f8a9b0c1d", full_name: "Mara Quispe" },
  },
};

const LIST_KIND: Record<string, string> = { COMPANY: "companies", PERSON: "people", INVESTOR: "investors" };

const listList = {
  key: "list_list",
  noun: "List",
  display: { label: "List lists", description: "Used to pick a list.", hidden: true },
  operation: {
    async perform(z: Z, b: Bundle): Promise<Obj[]> {
      return arr((await api(z, b, "/lists")).items).map((l) => ({ id: l.id, name: `${String(l.name)} (${String(LIST_KIND[String(l.entity_type)] ?? l.entity_type)})` }));
    },
  },
};

const addToList = {
  key: "add_to_list",
  noun: "List item",
  display: { label: "Add to List", description: "Add a company, person or investor (by ID) to one of your lists." },
  operation: {
    inputFields: [
      { key: "list_id", label: "List", required: true, dynamic: "list_list.id.name" },
      { key: "entity_id", label: "Record ID", required: true, helpText: "com_…, per_… or inv_… (e.g. from Enrich Company)." },
    ],
    async perform(z: Z, b: Bundle): Promise<Obj> {
      const list = await api(z, b, `/lists/${encodeURIComponent(String(b.inputData.list_id))}`);
      const kind = LIST_KIND[String(list.entity_type)] ?? "companies";
      const res = await api(z, b, `/lists/${kind}/${encodeURIComponent(String(b.inputData.list_id))}`, { method: "PATCH", body: { add: [String(b.inputData.entity_id)] } });
      return { list_id: list.id, list_name: list.name, added: res.added ?? 0 };
    },
    sample: { list_id: "lst_65f0c2a91b3e4d7f8a9b0c1d", list_name: "Pipeline", added: 1 },
  },
};

export const app = {
  version: "1.0.0",
  platformVersion: "17.0.0",
  authentication: {
    type: "custom",
    fields: [
      { key: "api_key", label: "API key", required: true, type: "password", helpText: "Settings → API keys. Use an admin-approved key so Zaps can manage webhooks." },
      { key: "base_url", label: "API base URL", required: false, helpText: "Leave empty unless you run a dedicated deployment." },
    ],
    async test(z: Z, b: Bundle) {
      return api(z, b, "/me");
    },
    connectionLabel: (_z: Z, b: Bundle & { inputData: { organization?: { name?: string } } }) => b.inputData.organization?.name ?? "Founders AI",
  },
  beforeRequest: [addApiKey],
  triggers: { saved_search_list: savedSearchList, new_search_result: newSearchResult, new_talent_signal: newTalentSignal, list_list: listList },
  creates: { enrich_company: enrichCompany, enrich_person: enrichPerson, add_to_list: addToList },
  searches: {},
};

export default app;
