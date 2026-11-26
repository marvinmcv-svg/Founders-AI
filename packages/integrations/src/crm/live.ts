/**
 * Live clients: each vendor's REST API over an injected transport. The app passes the SSRF-guarded
 * egress transport restricted to `LIVE_HOSTS[provider]`, so a stored credential can only ever be sent
 * to that vendor. OAuth apps need marketplace review (H9); API tokens work where the vendor offers them.
 */
import { SPECS } from "./specs";
import { obj, str, type CrmProvider, type ListPage, type Native, type NativeClient, type PushResult } from "./types";

export type HttpRequest = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; headers: Record<string, string>; body?: string };
export type HttpResponse = { status: number; body: string };
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export type LiveAuth = { token: string; instanceUrl?: string; baseId?: string };

export const LIVE_HOSTS: Record<CrmProvider, string[]> = {
  HUBSPOT: ["api.hubapi.com"],
  SALESFORCE: ["my.salesforce.com", "salesforce.com"],
  ATTIO: ["api.attio.com"],
  AFFINITY: ["api.affinity.co"],
  PIPEDRIVE: ["api.pipedrive.com"],
  AIRTABLE: ["api.airtable.com"],
};

export class CrmHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CrmHttpError";
  }
}

type Ops = {
  whoami(): Promise<string>;
  list(object: string, cursor: string | null, limit: number): Promise<ListPage>;
  find(object: string, keyField: string, key: string): Promise<Native | null>;
  create(object: string, native: Native): Promise<string>;
  update(object: string, id: string, native: Native): Promise<void>;
};

function http(transport: Transport, headers: Record<string, string>) {
  return async (method: HttpRequest["method"], url: string, body?: unknown): Promise<Native> => {
    const res = await transport({
      method,
      url,
      headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json: Native = {};
    try {
      json = res.body ? (JSON.parse(res.body) as Native) : {};
    } catch {
      json = {};
    }
    if (res.status === 401 || res.status === 403) throw new CrmHttpError(res.status, "The CRM rejected the credentials — reconnect the integration.");
    if (res.status === 429) throw new CrmHttpError(429, "The CRM rate limit was reached — the sync will retry later.");
    if (res.status >= 400) throw new CrmHttpError(res.status, str(json.message) ?? str(obj(json.error).message) ?? `CRM request failed (${res.status})`);
    return json;
  };
}

const arr = (v: unknown): Native[] => (Array.isArray(v) ? (v as Native[]) : []);
const enc = encodeURIComponent;
const soql = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function hubspotOps(t: Transport, a: LiveAuth): Ops {
  const base = "https://api.hubapi.com";
  const call = http(t, { authorization: `Bearer ${a.token}` });
  const props = (object: string) =>
    object === "companies"
      ? "name,domain,hubspot_owner_id,lifecyclestage,notes_last_updated"
      : object === "contacts"
        ? "firstname,lastname,email,hs_linkedin_url,lifecyclestage,associatedcompanyid,hubspot_owner_id,notes_last_updated"
        : "dealname,dealstage,associatedcompanyid,hs_is_closed,hubspot_owner_id";
  return {
    async whoami() {
      const r = await call("GET", `${base}/account-info/v3/details`);
      return `HubSpot portal ${str(r.portalId) ?? ""}`.trim();
    },
    async list(object, cursor, limit) {
      const r = await call("GET", `${base}/crm/v3/objects/${object}?limit=${limit}&properties=${props(object)}${cursor ? `&after=${enc(cursor)}` : ""}`);
      return { items: arr(r.results), next: str(obj(obj(r.paging).next).after) };
    },
    async find(object, keyField, key) {
      const r = await call("POST", `${base}/crm/v3/objects/${object}/search`, {
        filterGroups: [{ filters: [{ propertyName: keyField, operator: "CONTAINS_TOKEN", value: key }] }],
        properties: props(object).split(","),
        limit: 1,
      });
      return arr(r.results)[0] ?? null;
    },
    async create(object, native) {
      return String((await call("POST", `${base}/crm/v3/objects/${object}`, native)).id);
    },
    async update(object, id, native) {
      await call("PATCH", `${base}/crm/v3/objects/${object}/${enc(id)}`, native);
    },
  };
}

function salesforceOps(t: Transport, a: LiveAuth): Ops {
  if (!a.instanceUrl) throw new Error("Salesforce needs the instance URL from the OAuth response");
  const root = a.instanceUrl.replace(/\/$/, "");
  const base = `${root}/services/data/v61.0`;
  const call = http(t, { authorization: `Bearer ${a.token}` });
  const fields: Record<string, string> = {
    Account: "Id,Name,Website,Type,OwnerId,Owner.Name,LastActivityDate,LastModifiedDate",
    Contact: "Id,FirstName,LastName,Email,Founders_LinkedIn__c,AccountId,OwnerId,Owner.Name,LastActivityDate",
    Opportunity: "Id,Name,StageName,AccountId,IsClosed,OwnerId,Owner.Name,LastActivityDate",
  };
  return {
    async whoami() {
      const r = await call("GET", `${root}/services/oauth2/userinfo`);
      return `Salesforce ${str(r.organization_id) ?? ""}`.trim();
    },
    async list(object, cursor, limit) {
      const url = cursor ? `${root}${cursor}` : `${base}/query?q=${enc(`SELECT ${fields[object] ?? "Id"} FROM ${object} ORDER BY LastModifiedDate DESC LIMIT ${Math.max(limit, 2000)}`)}`;
      const r = await call("GET", url);
      return { items: arr(r.records), next: r.done === false ? str(r.nextRecordsUrl) : null };
    },
    async find(object, keyField, key) {
      const r = await call("GET", `${base}/query?q=${enc(`SELECT ${fields[object] ?? "Id"} FROM ${object} WHERE ${keyField} LIKE '%${soql(key)}%' LIMIT 1`)}`);
      return arr(r.records)[0] ?? null;
    },
    async create(object, native) {
      return String((await call("POST", `${base}/sobjects/${object}`, native)).id);
    },
    async update(object, id, native) {
      await call("PATCH", `${base}/sobjects/${object}/${enc(id)}`, native);
    },
  };
}

function attioOps(t: Transport, a: LiveAuth): Ops {
  const base = "https://api.attio.com/v2";
  const call = http(t, { authorization: `Bearer ${a.token}` });
  return {
    async whoami() {
      const r = await call("GET", `${base}/self`);
      return `Attio ${str(r.workspace_name) ?? ""}`.trim();
    },
    async list(object, cursor, limit) {
      const offset = Number(cursor ?? 0) || 0;
      const r = await call("POST", `${base}/objects/${object}/records/query`, { limit, offset });
      const items = arr(r.data);
      return { items, next: items.length === limit ? String(offset + limit) : null };
    },
    async find(object, keyField, key) {
      const filter = keyField === "domains" ? { domains: { domain: { $eq: key } } } : { [keyField]: { $contains: key } };
      const r = await call("POST", `${base}/objects/${object}/records/query`, { filter, limit: 1 });
      return arr(r.data)[0] ?? null;
    },
    async create(object, native) {
      const r = await call("POST", `${base}/objects/${object}/records`, { data: native });
      return String(obj(obj(r.data).id).record_id);
    },
    async update(object, id, native) {
      await call("PATCH", `${base}/objects/${object}/records/${enc(id)}`, { data: native });
    },
  };
}

function affinityOps(t: Transport, a: LiveAuth): Ops {
  const base = "https://api.affinity.co";
  const call = http(t, { authorization: `Basic ${Buffer.from(`:${a.token}`).toString("base64")}` });
  return {
    async whoami() {
      const r = await call("GET", `${base}/auth/whoami`);
      return `Affinity ${str(obj(r.tenant).name) ?? ""}`.trim();
    },
    async list(object, cursor, limit) {
      const r = await call("GET", `${base}/${object}?page_size=${limit}${cursor ? `&page_token=${enc(cursor)}` : ""}`);
      return { items: arr(r[object]), next: str(r.next_page_token) };
    },
    async find(object, _keyField, key) {
      const r = await call("GET", `${base}/${object}?term=${enc(key)}&page_size=1`);
      return arr(r[object])[0] ?? null;
    },
    async create(object, native) {
      return String((await call("POST", `${base}/${object}`, native)).id);
    },
    async update(object, id, native) {
      await call("PUT", `${base}/${object}/${enc(id)}`, native);
    },
  };
}

function pipedriveOps(t: Transport, a: LiveAuth): Ops {
  const base = "https://api.pipedrive.com/v1";
  const call = http(t, { "x-api-token": a.token });
  return {
    async whoami() {
      const r = await call("GET", `${base}/users/me`);
      return `Pipedrive ${str(obj(r.data).company_name) ?? ""}`.trim();
    },
    async list(object, cursor, limit) {
      const r = await call("GET", `${base}/${object}?start=${Number(cursor ?? 0) || 0}&limit=${limit}`);
      const p = obj(obj(r.additional_data).pagination);
      return { items: arr(r.data), next: p.more_items_in_collection ? str(p.next_start) : null };
    },
    async find(object, _keyField, key) {
      const r = await call("GET", `${base}/${object}/search?term=${enc(key)}&exact_match=true&limit=1`);
      const hit = obj(arr(obj(r.data).items)[0]).item;
      return hit ? obj(hit) : null;
    },
    async create(object, native) {
      return String(obj((await call("POST", `${base}/${object}`, native)).data).id);
    },
    async update(object, id, native) {
      await call("PUT", `${base}/${object}/${enc(id)}`, native);
    },
  };
}

function airtableOps(t: Transport, a: LiveAuth): Ops {
  if (!a.baseId) throw new Error("Airtable needs the base id");
  const base = `https://api.airtable.com/v0/${enc(a.baseId)}`;
  const call = http(t, { authorization: `Bearer ${a.token}` });
  return {
    async whoami() {
      const r = await call("GET", "https://api.airtable.com/v0/meta/whoami");
      return `Airtable ${str(r.email) ?? str(r.id) ?? ""}`.trim();
    },
    async list(object, cursor, limit) {
      const r = await call("GET", `${base}/${enc(object)}?pageSize=${Math.min(limit, 100)}${cursor ? `&offset=${enc(cursor)}` : ""}`);
      return { items: arr(r.records), next: str(r.offset) };
    },
    async find(object, keyField, key) {
      const formula = `FIND('${key.replace(/'/g, "\\'")}', LOWER({${keyField}}))`;
      const r = await call("GET", `${base}/${enc(object)}?maxRecords=1&filterByFormula=${enc(formula)}`);
      return arr(r.records)[0] ?? null;
    },
    async create(object, native) {
      const r = await call("POST", `${base}/${enc(object)}`, { records: [native], typecast: true });
      return String(arr(r.records)[0]?.id);
    },
    async update(object, id, native) {
      await call("PATCH", `${base}/${enc(object)}`, { records: [{ id, ...native }], typecast: true });
    },
  };
}

const OPS: Record<CrmProvider, (t: Transport, a: LiveAuth) => Ops> = {
  HUBSPOT: hubspotOps,
  SALESFORCE: salesforceOps,
  ATTIO: attioOps,
  AFFINITY: affinityOps,
  PIPEDRIVE: pipedriveOps,
  AIRTABLE: airtableOps,
};

export function liveClient(provider: CrmProvider, auth: LiveAuth, transport: Transport): NativeClient {
  const ops = OPS[provider](transport, auth);
  const spec = SPECS[provider];
  return {
    whoami: () => ops.whoami(),
    list: (object, cursor, limit) => ops.list(object, cursor, limit),
    async upsert(object, items, keyField, keyOf): Promise<PushResult[]> {
      const out: PushResult[] = [];
      for (const it of items) {
        try {
          const found = await ops.find(object, keyField, it.key);
          // Search is fuzzy on most vendors; only treat it as the same record if the key matches exactly.
          if (found && keyOf(found) === it.key) {
            const id = spec.idOf(found);
            await ops.update(object, id, it.native);
            out.push({ key: it.key, externalId: id, created: false });
          } else {
            out.push({ key: it.key, externalId: await ops.create(object, it.native), created: true });
          }
        } catch (e) {
          if (e instanceof CrmHttpError && (e.status === 401 || e.status === 403)) throw e;
          out.push({ key: it.key, externalId: null, created: false, error: (e as Error).message });
        }
      }
      return out;
    },
  };
}
