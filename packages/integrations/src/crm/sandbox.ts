/**
 * Sandbox CRM: a per-workspace fake of each vendor that stores *native* records (the same shapes the
 * live APIs return). Used by SANDBOX connections in the demo and by the round-trip tests, so the
 * adapter's read/write mapping is exercised exactly as it would be against the real API.
 */
import { randomBytes } from "node:crypto";
import { SPECS, nativeFromRecord } from "./specs";
import type { CrmProvider, ListPage, Native, NativeClient, PushResult } from "./types";

/** Storage for sandbox objects; the app implements it on `crm_sandbox_objects` (org-scoped). */
export interface SandboxStore {
  list(object: string, offset: number, limit: number): Promise<Native[]>;
  all(object: string): Promise<Native[]>;
  put(object: string, externalId: string, native: Native): Promise<void>;
}

export class MemorySandboxStore implements SandboxStore {
  readonly data = new Map<string, Map<string, Native>>();
  private table(object: string) {
    let t = this.data.get(object);
    if (!t) this.data.set(object, (t = new Map()));
    return t;
  }
  async list(object: string, offset: number, limit: number) {
    return [...this.table(object).values()].slice(offset, offset + limit);
  }
  async all(object: string) {
    return [...this.table(object).values()];
  }
  async put(object: string, externalId: string, native: Native) {
    this.table(object).set(externalId, native);
  }
}

const hex = (n: number) => randomBytes(n).toString("hex");

/** New id in the vendor's own format, written where the vendor puts it. */
function withNewId(provider: CrmProvider, object: string, native: Native): { id: string; native: Native } {
  const now = new Date().toISOString();
  switch (provider) {
    case "HUBSPOT": {
      const id = String(10_000_000 + parseInt(hex(3), 16));
      return { id, native: { id, createdAt: now, updatedAt: now, archived: false, ...native } };
    }
    case "SALESFORCE": {
      const prefix = object === "Account" ? "001" : object === "Contact" ? "003" : "006";
      const id = `${prefix}${hex(8).toUpperCase().slice(0, 15)}`;
      return { id, native: { Id: id, attributes: { type: object }, LastModifiedDate: now, ...native } };
    }
    case "ATTIO": {
      const h = hex(16);
      const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
      return { id, native: { id: { workspace_id: "sandbox", object_id: object, record_id: id }, created_at: now, ...native } };
    }
    case "AFFINITY":
    case "PIPEDRIVE": {
      const n = parseInt(hex(3), 16);
      return { id: String(n), native: { id: n, ...(provider === "PIPEDRIVE" ? { add_time: now, update_time: now } : {}), ...native } };
    }
    case "AIRTABLE": {
      const id = `rec${hex(7).slice(0, 14)}`;
      return { id, native: { id, createdTime: now, ...native } };
    }
  }
}

/** One level of merge: nested objects (properties / fields / values) are merged, scalars replaced. */
export function mergeNative(a: Native, b: Native): Native {
  const out: Native = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    const isObj = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x);
    out[k] = isObj(prev) && isObj(v) ? { ...(prev as Native), ...(v as Native) } : v;
  }
  return out;
}

export function sandboxClient(provider: CrmProvider, store: SandboxStore): NativeClient {
  const spec = SPECS[provider];
  return {
    async whoami() {
      return `${spec.label} sandbox`;
    },
    async list(object, cursor, limit): Promise<ListPage> {
      const offset = cursor ? Number(cursor) || 0 : 0;
      const items = await store.list(object, offset, limit + 1);
      return { items: items.slice(0, limit), next: items.length > limit ? String(offset + limit) : null };
    },
    async upsert(object, items, _keyField, keyOf): Promise<PushResult[]> {
      const existing = new Map<string, Native>();
      for (const n of await store.all(object)) {
        const k = keyOf(n);
        if (k) existing.set(k, n);
      }
      const out: PushResult[] = [];
      for (const it of items) {
        const prev = existing.get(it.key);
        if (prev) {
          const merged = mergeNative(prev, it.native);
          const id = spec.idOf(prev);
          await store.put(object, id, merged);
          existing.set(it.key, merged);
          out.push({ key: it.key, externalId: id, created: false });
        } else {
          const { id, native } = withNewId(provider, object, it.native);
          await store.put(object, id, native);
          existing.set(it.key, native);
          out.push({ key: it.key, externalId: id, created: true });
        }
      }
      return out;
    },
  };
}

export type SandboxSeed = { companies: { name: string; domain: string }[]; people: { name: string; linkedinUrl: string; companyDomain?: string }[]; extraCompanies?: number };

/**
 * Fills a sandbox with a realistic book: companies (most matching our dataset by domain, some not),
 * contacts linked to them, and a few open / closed deals.
 */
export async function seedSandbox(provider: CrmProvider, store: SandboxStore, seed: SandboxSeed): Promise<{ companies: number; people: number; deals: number }> {
  const spec = SPECS[provider];
  const client = sandboxClient(provider, store);
  const owners = ["Ana Rojas", "Diego Paz", "Lucía Vaca"];
  const stages = ["lead", "qualified", "opportunity", "customer"];
  const comps = [
    ...seed.companies,
    ...Array.from({ length: seed.extraCompanies ?? 0 }, (_, i) => ({ name: `Unmatched Prospect ${i + 1}`, domain: `prospect-${i + 1}-${hex(2)}.example` })),
  ];
  const companyIds = new Map<string, string>();
  const cRes = await client.upsert(
    spec.objects.COMPANY,
    comps.map((c, i) => {
      const n = nativeFromRecord(spec, "COMPANY", { name: c.name, domain: c.domain, linkedinUrl: null });
      return { key: c.domain, native: decorate(provider, "COMPANY", n, owners[i % owners.length] as string, stages[i % stages.length] as string, i) };
    }),
    spec.keyField.COMPANY,
    (n) => spec.keyOf("COMPANY", n),
  );
  cRes.forEach((r) => r.externalId && companyIds.set(r.key, r.externalId));

  const pRes = await client.upsert(
    spec.objects.PERSON,
    seed.people.map((p, i) => {
      const n = nativeFromRecord(spec, "PERSON", { name: p.name, domain: null, linkedinUrl: p.linkedinUrl });
      const parent = p.companyDomain ? companyIds.get(p.companyDomain) : undefined;
      return { key: p.linkedinUrl, native: decorate(provider, "PERSON", n, owners[i % owners.length] as string, null, i, parent) };
    }),
    spec.keyField.PERSON,
    (n) => spec.keyOf("PERSON", n),
  );

  // Deals: every third matched company gets one; every other one is closed.
  let deals = 0;
  const dealObject = spec.objects.DEAL;
  for (const [i, c] of seed.companies.entries()) {
    if (i % 3 !== 0) continue;
    const parent = companyIds.get(c.domain);
    if (!parent) continue;
    const open = i % 6 !== 3;
    const { id, native } = dealNative(provider, `${c.name} — ${open ? "New business" : "Closed"}`, parent, open);
    await store.put(dealObject, id, native);
    deals++;
  }
  return { companies: cRes.length, people: pRes.length, deals };
}

function decorate(provider: CrmProvider, kind: "COMPANY" | "PERSON", n: Native, owner: string, stage: string | null, i: number, parent?: string): Native {
  const last = new Date(Date.now() - (i % 120) * 86_400_000).toISOString().slice(0, 10);
  switch (provider) {
    case "HUBSPOT":
      return mergeNative(n, { properties: { hubspot_owner_id: owner, notes_last_updated: last, ...(stage ? { lifecyclestage: stage } : {}), ...(parent ? { associatedcompanyid: parent } : {}) } });
    case "SALESFORCE":
      return { ...n, Owner: { Name: owner }, LastActivityDate: last, ...(stage ? { Type: stage } : {}), ...(parent ? { AccountId: parent } : {}) };
    case "ATTIO":
      return mergeNative(n, {
        values: {
          owner: [{ referenced_actor_id: owner }],
          last_interaction: [{ value: last }],
          ...(stage ? { stage: [{ status: stage }] } : {}),
          ...(parent ? { company: [{ target_record_id: parent }] } : {}),
        },
      });
    case "AFFINITY":
      return mergeNative(n, { fields: { Owner: owner, ...(stage ? { Status: stage } : {}) }, interaction_dates: { last_interaction_date: last }, ...(parent ? { organization_ids: [Number(parent)] } : {}) });
    case "PIPEDRIVE":
      return { ...n, owner_id: { name: owner }, last_activity_date: last, ...(stage ? { label: stage } : {}), ...(kind === "PERSON" && parent ? { org_id: { value: Number(parent) } } : {}) };
    case "AIRTABLE":
      return mergeNative(n, { fields: { Owner: owner, "Last Activity": last, ...(stage ? { Status: stage } : {}), ...(parent ? { "Company Record": [parent] } : {}) } });
  }
}

function dealNative(provider: CrmProvider, name: string, parent: string, open: boolean): { id: string; native: Native } {
  const stage = open ? "negotiation" : "closedwon";
  const object = SPECS[provider].objects.DEAL;
  const base: Record<CrmProvider, Native> = {
    HUBSPOT: { properties: { dealname: name, dealstage: stage, associatedcompanyid: parent, hs_is_closed: String(!open) } },
    SALESFORCE: { Name: name, StageName: open ? "Negotiation/Review" : "Closed Won", AccountId: parent, IsClosed: !open },
    ATTIO: { values: { name: [{ value: name }], stage: [{ status: open ? "In progress" : "Won" }], associated_company: [{ target_record_id: parent }] } },
    AFFINITY: { name, organization_ids: [Number(parent)], fields: { Status: open ? "Diligence" : "Closed" } },
    PIPEDRIVE: { title: name, status: open ? "open" : "won", stage_name: open ? "Negotiation" : "Won", org_id: { value: Number(parent) } },
    AIRTABLE: { fields: { Name: name, Stage: open ? "Diligence" : "Won", Company: [parent] } },
  };
  return withNewId(provider, object, base[provider]);
}
