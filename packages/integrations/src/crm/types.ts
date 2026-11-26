/**
 * CRM adapter contract (plan 13.1): `{connect, listObjects, pull(cursor), push(records), fieldMap}`.
 *
 * Each provider is a `ProviderSpec` (native object names, how to read and write its record shapes,
 * default field map) plus a `NativeClient` that moves native records. The live client speaks the
 * vendor's REST API over an injected, SSRF-guarded transport; the sandbox client stores native records
 * in Postgres so the demo and the round-trip tests run the same adapter code without vendor accounts.
 */

export const CRM_PROVIDERS = ["ATTIO", "AFFINITY", "SALESFORCE", "HUBSPOT", "PIPEDRIVE", "AIRTABLE"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export type CrmKind = "COMPANY" | "PERSON" | "DEAL";
export type PushKind = "COMPANY" | "PERSON";
export type Native = Record<string, unknown>;

/** A CRM object in our normalised shape. */
export type CrmRecord = {
  kind: CrmKind;
  externalId: string;
  name: string | null;
  /** Normalised (lower-case, no scheme, no `www.`). */
  domain: string | null;
  /** Normalised `linkedin.com/in/<slug>` or `linkedin.com/company/<slug>`. */
  linkedinUrl: string | null;
  email: string | null;
  owner: string | null;
  stage: string | null;
  lastActivity: string | null;
  /** Persons and deals: the company they belong to. */
  companyExternalId: string | null;
  /** Deals only. */
  open: boolean | null;
  raw: Native;
};

/** Fields we can write to a CRM (plan 13.1 push setup). Values come from our entities. */
export const PUSH_FIELDS = {
  COMPANY: [
    "name",
    "domain",
    "tagline",
    "hq",
    "employee_count",
    "growth_stage",
    "total_funding_usd",
    "last_funding_date",
    "est_revenue_usd",
    "rank",
    "profile_url",
  ],
  PERSON: ["first", "last", "linkedin_url", "title", "company_name", "location", "profile_url"],
} as const satisfies Record<PushKind, readonly string[]>;
export type PushField<K extends PushKind = PushKind> = (typeof PUSH_FIELDS)[K][number];

export type PushValue = string | number | null;
export type PushValues = Partial<Record<string, PushValue>>;
/** Our field → the provider's native field. */
export type FieldMap = Record<string, string>;

export type PushItem = {
  /** Dedupe key: normalised domain (companies) or LinkedIn URL (people). */
  key: string;
  values: PushValues;
  owner?: string | null;
};
export type PushResult = { key: string; externalId: string | null; created: boolean; error?: string };

export type ListPage = { items: Native[]; next: string | null };

/** Moves native records. Live = vendor REST API; sandbox = Postgres. */
export interface NativeClient {
  whoami(): Promise<string>;
  list(object: string, cursor: string | null, limit: number): Promise<ListPage>;
  /** Create-or-update by the key; `keyOf` reads the key from an existing native record. */
  upsert(object: string, items: { key: string; native: Native }[], keyField: string, keyOf: (n: Native) => string | null): Promise<PushResult[]>;
}

export type ProviderSpec = {
  provider: CrmProvider;
  label: string;
  /** Authentication the live client accepts. OAuth needs the marketplace app (H9). */
  auth: ("OAUTH" | "TOKEN")[];
  objects: Record<CrmKind, string>;
  defaultFieldMap: Record<PushKind, FieldMap>;
  /** Native field used as the dedupe key on push. */
  keyField: Record<PushKind, string>;
  idOf(native: Native): string;
  fromNative(kind: CrmKind, native: Native): CrmRecord;
  /** `fields` are keyed by native field name (already passed through the field map). */
  toNative(kind: PushKind, fields: Record<string, PushValue>, owner: string | null): Native;
  keyOf(kind: PushKind, native: Native): string | null;
};

export type ObjectInfo = { kind: CrmKind; native: string; label: string };

export interface CrmAdapter {
  readonly spec: ProviderSpec;
  connect(): Promise<{ account: string }>;
  listObjects(): ObjectInfo[];
  pull(kind: CrmKind, cursor: string | null, limit?: number): Promise<{ records: CrmRecord[]; next: string | null }>;
  push(kind: PushKind, items: PushItem[], fieldMap?: FieldMap): Promise<PushResult[]>;
  fieldMap(kind: PushKind): FieldMap;
}

/* ------------------------------------------------------------------ */
/* Normalisers shared by every spec                                     */
/* ------------------------------------------------------------------ */

export function normDomain(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    ?.replace(/:\d+$/, "");
  return s && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

export function normLinkedin(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = /linkedin\.(?:com|invalid)\/(in|company)\/([^/?#\s]+)/i.exec(raw.trim());
  if (!m) return null;
  const tld = /linkedin\.invalid/i.test(raw) ? "invalid" : "com";
  return `linkedin.${tld}/${(m[1] as string).toLowerCase()}/${decodeURIComponent(m[2] as string).toLowerCase()}`;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function obj(v: unknown): Native {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Native) : {};
}

export function first(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

export function blankRecord(kind: CrmKind, externalId: string, raw: Native): CrmRecord {
  return {
    kind,
    externalId,
    name: null,
    domain: null,
    linkedinUrl: null,
    email: null,
    owner: null,
    stage: null,
    lastActivity: null,
    companyExternalId: null,
    open: null,
    raw,
  };
}
