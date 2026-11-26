/**
 * CRM sync (plan 13.1): connect, pull with match preview, push (create-or-update by domain /
 * LinkedIn), scheduled enrichment, activity log, CRM badges. Every function is org-scoped.
 *
 * Connections run in one of three modes: SANDBOX (a per-workspace fake vendor in
 * `crm_sandbox_objects`, same native shapes), TOKEN (vendor API token) or OAUTH (marketplace apps, H9).
 * Live calls go through the egress module restricted to the vendor's hosts.
 */
import { brand } from "@founders/config";
import {
  CRM_PROVIDERS,
  CrmHttpError,
  LIVE_HOSTS,
  SPECS,
  createAdapter,
  liveClient,
  normDomain,
  normLinkedin,
  sandboxClient,
  seedSandbox,
  type CrmAdapter,
  type CrmKind,
  type CrmProvider,
  type CrmRecord,
  type FieldMap,
  type LiveAuth,
  type Native,
  type PushItem,
  type PushKind,
  type SandboxStore,
  type Transport,
} from "@founders/integrations/crm";
import { sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../crypto";
import { egressFetch } from "../egress";
import { newId } from "../ids";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError, type OrgContext } from "./workspace";
import { enqueueWebhookEvent } from "./webhooks";

export { CRM_PROVIDERS, type CrmProvider };

/** A text[] bound as one JSON parameter (no parameter-count limit, empty lists work). */
const tarr = (xs: readonly string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(xs)}::jsonb))`;

/** Records read per object per pull; larger books page through scheduled runs (cursor kept). */
export const CRM_PULL_MAX = 20_000;
export const CRM_PUSH_MAX = 5_000;
const PAGE = 100;

export type CrmMode = "SANDBOX" | "TOKEN" | "OAUTH";
export type PullConfig = { objects?: CrmKind[] };
export type PushConfig = { owner?: string | null; fieldMap?: Partial<Record<PushKind, FieldMap>>; autoPushSearches?: boolean };
export type CrmSchedule = "OFF" | "DAILY" | "WEEKLY";

type ConnRow = {
  id: string;
  org_id: string;
  provider: CrmProvider;
  mode: CrmMode;
  auth: string | null;
  pull_config: PullConfig | null;
  push_config: PushConfig | null;
  schedule: CrmSchedule;
  status: string;
  last_error: string | null;
  last_pull_at: string | null;
  last_push_at: string | null;
  created_at: string;
};

function assertAdmin(ctx: OrgContext) {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only workspace admins can manage CRM integrations");
}
function assertWrite(ctx: OrgContext) {
  if (ctx.role === "viewer") throw new ForbiddenError("Viewers cannot push to the CRM");
}
function isProvider(p: string): p is CrmProvider {
  return (CRM_PROVIDERS as readonly string[]).includes(p);
}

/* ------------------------------------------------------------------ */
/* Clients                                                              */
/* ------------------------------------------------------------------ */

/** Sandbox storage on `crm_sandbox_objects`, bounded to one org and provider. */
export function dbSandboxStore(orgId: string, provider: CrmProvider): SandboxStore {
  return {
    async list(object, offset, limit) {
      const rows = await q<{ data: Native }>(sql`SELECT data FROM crm_sandbox_objects WHERE org_id = ${orgId} AND provider = ${provider} AND object = ${object}
        ORDER BY external_id LIMIT ${limit} OFFSET ${offset}`);
      return rows.map((r) => r.data);
    },
    async all(object) {
      const rows = await q<{ data: Native }>(sql`SELECT data FROM crm_sandbox_objects WHERE org_id = ${orgId} AND provider = ${provider} AND object = ${object}`);
      return rows.map((r) => r.data);
    },
    async put(object, externalId, native) {
      await q(sql`INSERT INTO crm_sandbox_objects (org_id, provider, object, external_id, data) VALUES (${orgId}, ${provider}, ${object}, ${externalId}, ${JSON.stringify(native)}::jsonb)
        ON CONFLICT (org_id, provider, object, external_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`);
    },
  };
}

/** Live transport: egress-guarded, vendor hosts only. */
export function egressTransport(provider: CrmProvider): Transport {
  return async (req) => {
    const r = await egressFetch(req.url, { method: req.method, headers: req.headers, ...(req.body !== undefined ? { body: req.body } : {}) }, { allowHosts: LIVE_HOSTS[provider], timeoutMs: 15_000, maxBytes: 8 * 1024 * 1024 });
    return { status: r.status, body: r.body };
  };
}

/** Test seam: replace the live transport (e.g. a recorder). */
let transportFactory: (p: CrmProvider) => Transport = egressTransport;
export function setCrmTransportForTests(f: ((p: CrmProvider) => Transport) | null) {
  transportFactory = f ?? egressTransport;
}

function adapterFor(conn: ConnRow): CrmAdapter {
  if (conn.mode === "SANDBOX") return createAdapter(conn.provider, sandboxClient(conn.provider, dbSandboxStore(conn.org_id, conn.provider)));
  if (!conn.auth) throw new Error("This connection has no credentials — reconnect it");
  const auth = JSON.parse(decryptSecret(conn.auth)) as LiveAuth;
  return createAdapter(conn.provider, liveClient(conn.provider, auth, transportFactory(conn.provider)));
}

async function getConn(orgId: string, provider: CrmProvider): Promise<ConnRow> {
  const [c] = await q<ConnRow>(sql`SELECT * FROM crm_connections WHERE org_id = ${orgId} AND provider = ${provider}`);
  if (!c) throw new NotFoundError(`${SPECS[provider].label} is not connected`);
  return c;
}

/* ------------------------------------------------------------------ */
/* Connections                                                          */
/* ------------------------------------------------------------------ */

export async function listCrmConnections(ctx: OrgContext) {
  const conns = await q<ConnRow>(sql`SELECT * FROM crm_connections WHERE org_id = ${ctx.orgId} ORDER BY created_at`);
  const stats = await q<{ provider: string; total: number; matched: number; enriched: number }>(sql`
    SELECT provider, count(*)::int AS total, count(entity_id)::int AS matched, count(enriched_at)::int AS enriched
    FROM crm_records WHERE org_id = ${ctx.orgId} AND object <> 'DEAL' GROUP BY provider`);
  return CRM_PROVIDERS.map((provider) => {
    const spec = SPECS[provider];
    const c = conns.find((x) => x.provider === provider);
    const s = stats.find((x) => x.provider === provider);
    return {
      provider,
      label: spec.label,
      auth: spec.auth,
      connected: !!c,
      mode: c?.mode ?? null,
      status: c?.status ?? null,
      lastError: c?.last_error ?? null,
      schedule: c?.schedule ?? "OFF",
      pullConfig: c?.pull_config ?? { objects: ["COMPANY", "PERSON", "DEAL"] },
      pushConfig: c?.push_config ?? {},
      lastPullAt: c?.last_pull_at ?? null,
      lastPushAt: c?.last_push_at ?? null,
      records: s?.total ?? 0,
      matched: s?.matched ?? 0,
      enriched: s?.enriched ?? 0,
      fieldMap: spec.defaultFieldMap,
    };
  });
}

export type ConnectInput = { mode: "SANDBOX" } | { mode: "TOKEN"; token: string; instanceUrl?: string; baseId?: string };

export async function connectCrm(ctx: OrgContext, provider: string, input: ConnectInput): Promise<{ account: string; seeded?: { companies: number; people: number; deals: number } }> {
  assertAdmin(ctx);
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  const spec = SPECS[provider];
  let auth: string | null = null;
  if (input.mode === "TOKEN") {
    if (!spec.auth.includes("TOKEN")) throw new ForbiddenError(`${spec.label} only supports OAuth, which needs the marketplace app (pending review)`);
    if (!input.token || input.token.length < 8) throw new ForbiddenError("Enter the API token from your CRM settings");
    const live: LiveAuth = { token: input.token, ...(input.instanceUrl ? { instanceUrl: input.instanceUrl } : {}), ...(input.baseId ? { baseId: input.baseId } : {}) };
    // Verify before storing so a bad token never sits in the database.
    const probe = createAdapter(provider, liveClient(provider, live, transportFactory(provider)));
    const who = await probe.connect();
    auth = encryptSecret(JSON.stringify(live));
    await upsertConn(ctx, provider, "TOKEN", auth);
    await audit(ctx, "crm.connect", `${provider}:TOKEN`);
    return who;
  }
  await upsertConn(ctx, provider, "SANDBOX", null);
  const seeded = await seedSandboxFromWorkspace(ctx, provider);
  await audit(ctx, "crm.connect", `${provider}:SANDBOX`);
  return { account: `${spec.label} sandbox`, seeded };
}

async function upsertConn(ctx: OrgContext, provider: CrmProvider, mode: CrmMode, auth: string | null) {
  await q(sql`INSERT INTO crm_connections (id, org_id, provider, mode, auth, pull_config, created_by)
    VALUES (${newId("crmConnection")}, ${ctx.orgId}, ${provider}, ${mode}, ${auth}, ${JSON.stringify({ objects: ["COMPANY", "PERSON", "DEAL"] })}::jsonb, ${ctx.userId})
    ON CONFLICT (org_id, provider) DO UPDATE SET mode = EXCLUDED.mode, auth = EXCLUDED.auth, status = 'ACTIVE', last_error = NULL, pull_cursor = NULL`);
}

/**
 * A sandbox book that looks like a real pipeline: the workspace's listed companies (or top-ranked
 * ones), their founders, plus a few prospects we do not track, so the match preview shows both.
 */
async function seedSandboxFromWorkspace(ctx: OrgContext, provider: CrmProvider) {
  await q(sql`DELETE FROM crm_sandbox_objects WHERE org_id = ${ctx.orgId} AND provider = ${provider}`);
  const companies = await q<{ id: string; name: string; domain: string }>(sql`
    WITH listed AS (
      SELECT DISTINCT li.entity_id FROM list_items li JOIN lists l ON l.id = li.list_id
      WHERE l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND l.entity_type = 'COMPANY')
    SELECT c.id, c.name, c.domain FROM companies c
    WHERE c.deleted_at IS NULL AND (c.id IN (SELECT entity_id FROM listed) OR c.rank <= 120)
    ORDER BY (c.id IN (SELECT entity_id FROM listed)) DESC, c.rank NULLS LAST LIMIT 120`);
  const people = await q<{ full_name: string; linkedin_url: string; domain: string }>(sql`
    SELECT p.full_name, p.linkedin_url, c.domain FROM people p JOIN companies c ON c.id = p.current_company_id
    WHERE p.current_company_id = ANY(${tarr(companies.slice(0, 60).map((c) => c.id))}) AND p.linkedin_url IS NOT NULL
      AND p.seniority IN ('Founder', 'C-Level', 'VP') LIMIT 80`);
  return seedSandbox(provider, dbSandboxStore(ctx.orgId, provider), {
    companies: companies.map((c) => ({ name: c.name, domain: c.domain })),
    people: people.map((p) => ({ name: p.full_name, linkedinUrl: normLinkedin(p.linkedin_url) as string, companyDomain: p.domain })).filter((p) => p.linkedinUrl),
    extraCompanies: 12,
  });
}

export async function disconnectCrm(ctx: OrgContext, provider: string) {
  assertAdmin(ctx);
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  await q(sql`DELETE FROM crm_connections WHERE org_id = ${ctx.orgId} AND provider = ${provider}`);
  await q(sql`DELETE FROM crm_records WHERE org_id = ${ctx.orgId} AND provider = ${provider}`);
  await q(sql`DELETE FROM crm_sandbox_objects WHERE org_id = ${ctx.orgId} AND provider = ${provider}`);
  await refreshMyCrm(ctx);
  await audit(ctx, "crm.disconnect", provider);
}

export async function updateCrmConfig(ctx: OrgContext, provider: string, input: { pullConfig?: PullConfig; pushConfig?: PushConfig; schedule?: CrmSchedule }) {
  assertAdmin(ctx);
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  const conn = await getConn(ctx.orgId, provider);
  const kinds = input.pullConfig?.objects?.filter((k) => ["COMPANY", "PERSON", "DEAL"].includes(k));
  const pull = input.pullConfig ? { objects: kinds?.length ? kinds : ["COMPANY"] } : conn.pull_config;
  const push = input.pushConfig ? sanitizePushConfig(provider, input.pushConfig) : conn.push_config;
  const schedule = input.schedule && ["OFF", "DAILY", "WEEKLY"].includes(input.schedule) ? input.schedule : conn.schedule;
  await q(sql`UPDATE crm_connections SET pull_config = ${JSON.stringify(pull)}::jsonb, push_config = ${JSON.stringify(push ?? {})}::jsonb, schedule = ${schedule}
    WHERE org_id = ${ctx.orgId} AND provider = ${provider}`);
}

function sanitizePushConfig(provider: CrmProvider, c: PushConfig): PushConfig {
  const spec = SPECS[provider];
  const fieldMap: Partial<Record<PushKind, FieldMap>> = {};
  for (const kind of ["COMPANY", "PERSON"] as const) {
    const m = c.fieldMap?.[kind];
    if (!m) continue;
    const allowed = Object.keys(spec.defaultFieldMap[kind]);
    fieldMap[kind] = Object.fromEntries(
      Object.entries(m)
        .filter(([ours, theirs]) => allowed.includes(ours) && typeof theirs === "string" && /^[\w .()-]{0,80}$/.test(theirs))
        .map(([ours, theirs]) => [ours, theirs.trim()]),
    );
  }
  return { owner: c.owner?.trim().slice(0, 120) || null, fieldMap, autoPushSearches: !!c.autoPushSearches };
}

/* ------------------------------------------------------------------ */
/* Pull + match                                                         */
/* ------------------------------------------------------------------ */

type Matched = CrmRecord & { entityType: "COMPANY" | "PERSON" | null; entityId: string | null; entityName: string | null; matchMethod: string | null };

async function readAll(adapter: CrmAdapter, kind: CrmKind): Promise<CrmRecord[]> {
  const out: CrmRecord[] = [];
  let cursor: string | null = null;
  do {
    const page = await adapter.pull(kind, cursor, PAGE);
    out.push(...page.records);
    cursor = page.next;
  } while (cursor && out.length < CRM_PULL_MAX);
  return out.slice(0, CRM_PULL_MAX);
}

/** Match CRM records to our entities: domain → company, LinkedIn / email → person, exact name → company. */
export async function matchRecords(records: CrmRecord[]): Promise<Matched[]> {
  const domains = [...new Set(records.map((r) => r.domain).filter((d): d is string => !!d))];
  const links = [...new Set(records.map((r) => r.linkedinUrl).filter((d): d is string => !!d))];
  const emails = [...new Set(records.map((r) => r.email?.toLowerCase()).filter((d): d is string => !!d))];
  const names = [...new Set(records.filter((r) => r.kind === "COMPANY" && !r.domain && r.name).map((r) => (r.name as string).toLowerCase()))];

  const byDomain = new Map<string, { id: string; name: string }>();
  if (domains.length) {
    const rows = await q<{ id: string; name: string; domain: string; domain_aliases: string[] }>(sql`
      SELECT id, name, domain, domain_aliases FROM companies WHERE deleted_at IS NULL AND (domain = ANY(${tarr(domains)}) OR domain_aliases && ${tarr(domains)})`);
    for (const r of rows) for (const d of [r.domain, ...r.domain_aliases]) byDomain.set(d, { id: r.id, name: r.name });
  }
  const byLink = new Map<string, { id: string; name: string }>();
  if (links.length) {
    const rows = await q<{ id: string; full_name: string; k: string }>(sql`
      SELECT id, full_name, substring(lower(linkedin_url) from 'linkedin\\.(?:com|invalid)/(?:in|company)/[^/?#]+') AS k FROM people
      WHERE deleted_at IS NULL AND substring(lower(linkedin_url) from 'linkedin\\.(?:com|invalid)/(?:in|company)/[^/?#]+') = ANY(${tarr(links)})`);
    for (const r of rows) byLink.set(r.k, { id: r.id, name: r.full_name });
  }
  const byEmail = new Map<string, { id: string; name: string }>();
  if (emails.length) {
    const rows = await q<{ id: string; full_name: string; email: string }>(sql`
      SELECT p.id, p.full_name, lower(e.email) AS email FROM person_emails e JOIN people p ON p.id = e.person_id WHERE lower(e.email) = ANY(${tarr(emails)})`);
    for (const r of rows) byEmail.set(r.email, { id: r.id, name: r.full_name });
  }
  const byName = new Map<string, { id: string; name: string }>();
  if (names.length) {
    const rows = await q<{ id: string; name: string; n: number }>(sql`
      SELECT min(id) AS id, min(name) AS name, count(*)::int AS n FROM companies WHERE deleted_at IS NULL AND lower(name) = ANY(${tarr(names)}) GROUP BY lower(name)`);
    for (const r of rows) if (r.n === 1) byName.set(r.name.toLowerCase(), { id: r.id, name: r.name });
  }

  return records.map((r): Matched => {
    let hit: { id: string; name: string } | undefined;
    let method: string | null = null;
    let type: "COMPANY" | "PERSON" | null = null;
    if (r.kind === "COMPANY") {
      if (r.domain && (hit = byDomain.get(r.domain))) method = "DOMAIN";
      else if (r.name && (hit = byName.get(r.name.toLowerCase()))) method = "NAME";
      if (hit) type = "COMPANY";
    } else if (r.kind === "PERSON") {
      if (r.linkedinUrl && (hit = byLink.get(r.linkedinUrl))) method = "LINKEDIN";
      else if (r.email && (hit = byEmail.get(r.email.toLowerCase()))) method = "EMAIL";
      if (hit) type = "PERSON";
    }
    return { ...r, entityType: type, entityId: hit?.id ?? null, entityName: hit?.name ?? null, matchMethod: method };
  });
}

/** Deals carry no entity of their own: count open ones and take the latest stage onto the company. */
function applyDeals(companies: Matched[], deals: CrmRecord[]): Matched[] {
  const byCompany = new Map<string, { open: number; stage: string | null }>();
  for (const d of deals) {
    if (!d.companyExternalId) continue;
    const s = byCompany.get(d.companyExternalId) ?? { open: 0, stage: null };
    if (d.open !== false) {
      s.open++;
      s.stage = s.stage ?? d.stage;
    }
    byCompany.set(d.companyExternalId, s);
  }
  return companies.map((c) => {
    const s = byCompany.get(c.externalId);
    return Object.assign(c, { openDeals: s?.open ?? 0, stage: c.stage ?? s?.stage ?? null });
  });
}

export type PullPreview = Record<
  string,
  { total: number; matched: number; unmatched: number; byMethod: Record<string, number>; sample: { externalId: string; name: string | null; key: string | null; entityId: string | null; entityName: string | null }[] }
>;

/** Match preview (plan 13.1: "5,535 matched & visible / unmatched") — reads the CRM, writes nothing. */
export async function previewCrmPull(ctx: OrgContext, provider: string, objects?: CrmKind[]): Promise<PullPreview> {
  assertAdmin(ctx);
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  const conn = await getConn(ctx.orgId, provider);
  const adapter = adapterFor(conn);
  const kinds = (objects ?? conn.pull_config?.objects ?? ["COMPANY", "PERSON"]).filter((k) => k !== "DEAL");
  const out: PullPreview = {};
  for (const kind of kinds) {
    const matched = await matchRecords(await readAll(adapter, kind));
    const byMethod: Record<string, number> = {};
    for (const m of matched) if (m.matchMethod) byMethod[m.matchMethod] = (byMethod[m.matchMethod] ?? 0) + 1;
    const hits = matched.filter((m) => m.entityId).length;
    out[kind] = {
      total: matched.length,
      matched: hits,
      unmatched: matched.length - hits,
      byMethod,
      sample: [...matched.filter((m) => m.entityId).slice(0, 6), ...matched.filter((m) => !m.entityId).slice(0, 4)].map((m) => ({
        externalId: m.externalId,
        name: m.name,
        key: m.domain ?? m.linkedinUrl ?? m.email,
        entityId: m.entityId,
        entityName: m.entityName,
      })),
    };
  }
  return out;
}

export type SyncResult = { logId: string; status: "SUCCEEDED" | "PARTIAL" | "FAILED"; counts: Record<string, number>; error?: string };

/** Pull and store: replaces this provider's snapshot of `crm_records` for the selected objects. */
export async function runCrmPull(ctx: OrgContext, provider: string, trigger = "manual"): Promise<SyncResult> {
  if (trigger === "manual") assertAdmin(ctx);
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  const conn = await getConn(ctx.orgId, provider);
  const kinds = conn.pull_config?.objects?.length ? conn.pull_config.objects : (["COMPANY", "PERSON", "DEAL"] as CrmKind[]);
  try {
    const adapter = adapterFor(conn);
    const pulled: Partial<Record<CrmKind, CrmRecord[]>> = {};
    for (const k of kinds) pulled[k] = await readAll(adapter, k);
    let companies = await matchRecords(pulled.COMPANY ?? []);
    companies = applyDeals(companies, pulled.DEAL ?? []);
    const people = await matchRecords(pulled.PERSON ?? []);
    const deals = (pulled.DEAL ?? []).map((d) => {
      const parent = companies.find((c) => c.externalId === d.companyExternalId);
      return { ...d, entityType: parent?.entityType ?? null, entityId: parent?.entityId ?? null, entityName: null, matchMethod: parent?.entityId ? "PARENT" : null } as Matched;
    });
    const all = [...companies, ...people, ...deals];
    // Upsert then prune what disappeared from the CRM; upserts leave `enriched_at` (our push history) alone.
    const [{ start } = { start: new Date().toISOString() }] = await q<{ start: string }>(sql`SELECT now()::text AS start`);
    await insertRecords(ctx.orgId, provider, all, "update");
    await q(sql`DELETE FROM crm_records WHERE org_id = ${ctx.orgId} AND provider = ${provider} AND object = ANY(${tarr(kinds)}) AND updated_at < ${start}::timestamptz`);
    const counts = {
      companies: companies.length,
      people: people.length,
      deals: deals.length,
      matched: [...companies, ...people].filter((m) => m.entityId).length,
      unmatched: [...companies, ...people].filter((m) => !m.entityId).length,
    };
    await q(sql`UPDATE crm_connections SET last_pull_at = now(), status = 'ACTIVE', last_error = NULL WHERE id = ${conn.id}`);
    await refreshMyCrm(ctx);
    const logId = await log(ctx, provider, "PULL", trigger, counts.companies + counts.people + counts.deals, counts, "SUCCEEDED");
    await enqueueWebhookEvent(ctx.orgId, "crm.sync", { provider, direction: "PULL", status: "SUCCEEDED", counts }).catch(() => 0);
    return { logId, status: "SUCCEEDED", counts };
  } catch (e) {
    return fail(ctx, conn, "PULL", trigger, e);
  }
}

async function insertRecords(orgId: string, provider: CrmProvider, rows: Matched[], onConflict: "update" | "nothing") {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await q(sql`INSERT INTO crm_records (org_id, provider, object, external_id, name, domain, linkedin_url, entity_type, entity_id, match_method, owner, stage, last_activity, open_deals, raw)
      SELECT ${orgId}, ${provider}, x.object, x.external_id, x.name, x.domain, x.linkedin_url, x.entity_type, x.entity_id, x.match_method, x.owner, x.stage,
        x.last_activity::timestamptz, coalesce(x.open_deals, 0), x.raw
      FROM jsonb_to_recordset(${JSON.stringify(
        chunk.map((r) => ({
          object: r.kind,
          external_id: r.externalId,
          name: r.name,
          domain: r.domain,
          linkedin_url: r.linkedinUrl,
          entity_type: r.entityType,
          entity_id: r.entityId,
          match_method: r.matchMethod,
          owner: r.owner,
          stage: r.stage,
          last_activity: validDate(r.lastActivity),
          open_deals: (r as Matched & { openDeals?: number }).openDeals ?? 0,
          raw: r.raw,
        })),
      )}::jsonb) AS x(object text, external_id text, name text, domain text, linkedin_url text, entity_type text, entity_id text, match_method text, owner text, stage text, last_activity text, open_deals int, raw jsonb)
      ON CONFLICT (org_id, provider, object, external_id) ${onConflict === "nothing" ? sql`DO NOTHING` : sql`DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain, linkedin_url = EXCLUDED.linkedin_url,
        entity_type = EXCLUDED.entity_type, entity_id = EXCLUDED.entity_id, match_method = EXCLUDED.match_method, owner = EXCLUDED.owner, stage = EXCLUDED.stage,
        last_activity = EXCLUDED.last_activity, open_deals = EXCLUDED.open_deals, raw = EXCLUDED.raw, updated_at = clock_timestamp()`}`);
  }
}

function validDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------------------------------------------------ */
/* Push + enrich                                                        */
/* ------------------------------------------------------------------ */

const profileUrl = (kind: PushKind, id: string) => `${brand.urls.app}/${kind === "COMPANY" ? "companies" : "people"}/${id}`;

async function buildPushItems(kind: PushKind, ids: string[], owner: string | null): Promise<{ items: PushItem[]; skipped: string[]; idByKey: Map<string, string> }> {
  const idByKey = new Map<string, string>();
  const items: PushItem[] = [];
  const skipped: string[] = [];
  if (kind === "COMPANY") {
    const rows = await q<Record<string, string | number | null> & { id: string; domain: string }>(sql`
      SELECT id, name, domain, tagline, concat_ws(', ', hq_city, hq_country) AS hq, employee_count, growth_stage, total_funding_usd,
        last_funding_date::text AS last_funding_date, est_revenue_usd, rank
      FROM companies WHERE id = ANY(${tarr(ids)}) AND deleted_at IS NULL`);
    for (const r of rows) {
      const key = normDomain(r.domain);
      if (!key) {
        skipped.push(r.id);
        continue;
      }
      idByKey.set(key, r.id);
      const { id, ...values } = r;
      items.push({ key, values: { ...values, domain: key, profile_url: profileUrl(kind, id) }, owner });
    }
  } else {
    const rows = await q<{ id: string; first: string; last: string; linkedin_url: string | null; title: string | null; company_name: string | null; location: string | null }>(sql`
      SELECT id, first, last, linkedin_url, current_title AS title, current_company_name AS company_name, location FROM people WHERE id = ANY(${tarr(ids)}) AND deleted_at IS NULL`);
    for (const r of rows) {
      const key = normLinkedin(r.linkedin_url);
      if (!key) {
        skipped.push(r.id);
        continue;
      }
      idByKey.set(key, r.id);
      items.push({ key, values: { first: r.first, last: r.last, linkedin_url: r.linkedin_url, title: r.title, company_name: r.company_name, location: r.location, profile_url: profileUrl(kind, r.id) }, owner });
    }
  }
  return { items, skipped, idByKey };
}

/** Push from grid / list / profile / extension / agent / MCP: create-or-update by domain or LinkedIn. */
export async function pushToCrm(ctx: OrgContext, provider: string, kind: PushKind, ids: string[], trigger = "manual"): Promise<SyncResult & { results: { entityId: string; externalId: string | null; created: boolean; error?: string }[] }> {
  assertWrite(ctx);
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  if (kind !== "COMPANY" && kind !== "PERSON") throw new ForbiddenError("Only companies and people can be pushed");
  const unique = [...new Set(ids)].slice(0, CRM_PUSH_MAX);
  const conn = await getConn(ctx.orgId, provider);
  try {
    const adapter = adapterFor(conn);
    const { items, skipped, idByKey } = await buildPushItems(kind, unique, conn.push_config?.owner ?? null);
    const res = await adapter.push(kind, items, conn.push_config?.fieldMap?.[kind]);
    const ok = res.filter((r) => r.externalId && !r.error);
    const spec = SPECS[provider];
    await insertRecords(
      ctx.orgId,
      provider,
      ok.map((r) => ({
        kind,
        externalId: r.externalId as string,
        name: String(items.find((i) => i.key === r.key)?.values.name ?? [items.find((i) => i.key === r.key)?.values.first, items.find((i) => i.key === r.key)?.values.last].filter(Boolean).join(" ")),
        domain: kind === "COMPANY" ? r.key : null,
        linkedinUrl: kind === "PERSON" ? r.key : null,
        email: null,
        owner: conn.push_config?.owner ?? null,
        stage: null,
        lastActivity: null,
        companyExternalId: null,
        open: null,
        raw: { pushedBy: spec.label },
        entityType: kind,
        entityId: idByKey.get(r.key) ?? null,
        entityName: null,
        matchMethod: "PUSHED",
      })),
      "nothing",
    );
    // Keep pulled CRM fields (owner, stage) when the record already existed; just mark it enriched.
    if (ok.length)
      await q(sql`UPDATE crm_records SET enriched_at = now() WHERE org_id = ${ctx.orgId} AND provider = ${provider} AND object = ${kind}
        AND external_id = ANY(${tarr(ok.map((r) => r.externalId as string))})`);
    const counts = { created: ok.filter((r) => r.created).length, updated: ok.filter((r) => !r.created).length, errors: res.length - ok.length, skipped: skipped.length };
    const status = counts.errors || counts.skipped ? (ok.length ? "PARTIAL" : "FAILED") : "SUCCEEDED";
    const firstError = res.find((r) => r.error)?.error ?? (skipped.length ? `${skipped.length} record(s) have no ${kind === "COMPANY" ? "domain" : "LinkedIn URL"} to dedupe on` : undefined);
    await q(sql`UPDATE crm_connections SET last_push_at = now() WHERE id = ${conn.id}`);
    if (kind === "COMPANY" && ok.length) await refreshMyCrm(ctx);
    const logId = await log(ctx, provider, trigger === "enrich" || trigger === "schedule" ? "ENRICH" : "PUSH", trigger, res.length, counts, status, firstError);
    await enqueueWebhookEvent(ctx.orgId, "crm.sync", { provider, direction: "PUSH", status, counts }).catch(() => 0);
    return {
      logId,
      status,
      counts,
      ...(firstError ? { error: firstError } : {}),
      results: [
        ...res.map((r) => ({ entityId: idByKey.get(r.key) ?? r.key, externalId: r.externalId, created: r.created, ...(r.error ? { error: r.error } : {}) })),
        ...skipped.map((id) => ({ entityId: id, externalId: null, created: false, error: "No dedupe key" })),
      ],
    };
  } catch (e) {
    const f = await fail(ctx, conn, "PUSH", trigger, e);
    return { ...f, results: [] };
  }
}

/** Scheduled enrichment: write our latest fields back onto every matched CRM record. */
export async function enrichCrm(ctx: OrgContext, provider: string, trigger = "enrich") {
  if (!isProvider(provider)) throw new NotFoundError("Unknown CRM");
  const out: Record<string, SyncResult> = {};
  for (const kind of ["COMPANY", "PERSON"] as const) {
    const rows = await q<{ entity_id: string }>(sql`SELECT DISTINCT entity_id FROM crm_records WHERE org_id = ${ctx.orgId} AND provider = ${provider}
      AND object = ${kind} AND entity_id IS NOT NULL LIMIT ${CRM_PUSH_MAX}`);
    if (rows.length) out[kind] = await pushToCrm({ ...ctx, role: ctx.role === "viewer" ? "member" : ctx.role }, provider, kind, rows.map((r) => r.entity_id), trigger);
  }
  return out;
}

/**
 * Keeps a pinned system list (plan 7.1 "My CRM" / "My Network") in step with its source: the list's
 * items become exactly `entityIds`. Created on first use. Used after every CRM pull/push/disconnect.
 */
export async function reconcileSystemList(orgId: string, ownerId: string, system: "MY_CRM" | "MY_NETWORK", entityType: "COMPANY" | "PERSON", entityIds: string[]) {
  let [l] = await q<{ id: string }>(sql`SELECT id FROM lists WHERE org_id = ${orgId} AND system = ${system} AND deleted_at IS NULL LIMIT 1`);
  if (!l) {
    const id = newId("list");
    await q(sql`INSERT INTO lists (id, org_id, owner_id, name, entity_type, visibility, system) VALUES (${id}, ${orgId}, ${ownerId}, ${system === "MY_CRM" ? "My CRM" : "My Network"}, ${entityType}, 'TEAM', ${system})`);
    l = { id };
  }
  await q(sql`DELETE FROM list_items WHERE list_id = ${l.id} AND NOT (entity_id = ANY(${tarr(entityIds)}))`);
  await q(sql`INSERT INTO list_items (list_id, entity_type, entity_id, added_by) SELECT ${l.id}, ${entityType}, x, ${ownerId} FROM unnest(${tarr(entityIds)}) AS x ON CONFLICT DO NOTHING`);
  return l.id;
}

async function refreshMyCrm(ctx: OrgContext) {
  const rows = await q<{ entity_id: string }>(sql`SELECT DISTINCT entity_id FROM crm_records WHERE org_id = ${ctx.orgId} AND entity_type = 'COMPANY' AND entity_id IS NOT NULL`);
  await reconcileSystemList(ctx.orgId, ctx.userId, "MY_CRM", "COMPANY", rows.map((r) => r.entity_id));
}

/* ------------------------------------------------------------------ */
/* Read side: log, badges, scheduler                                    */
/* ------------------------------------------------------------------ */

async function log(ctx: OrgContext, provider: CrmProvider, direction: string, trigger: string, n: number, counts: Record<string, number>, status: string, error?: string) {
  const id = newId("crmSync");
  await q(sql`INSERT INTO crm_sync_log (id, org_id, provider, direction, trigger, entity_count, counts, status, error, actor)
    VALUES (${id}, ${ctx.orgId}, ${provider}, ${direction}, ${trigger}, ${n}, ${JSON.stringify(counts)}::jsonb, ${status}, ${error ?? null}, ${ctx.userId})`);
  return id;
}

async function fail(ctx: OrgContext, conn: ConnRow, direction: string, trigger: string, e: unknown): Promise<SyncResult> {
  const msg = e instanceof Error ? e.message : String(e);
  const authFail = e instanceof CrmHttpError && (e.status === 401 || e.status === 403);
  await q(sql`UPDATE crm_connections SET status = ${authFail ? "ERROR" : conn.status}, last_error = ${msg} WHERE id = ${conn.id}`);
  const logId = await log(ctx, conn.provider, direction, trigger, 0, {}, "FAILED", msg);
  return { logId, status: "FAILED", counts: {}, error: msg };
}

async function audit(ctx: OrgContext, action: string, target: string) {
  await q(sql`INSERT INTO audit_log (id, org_id, actor, action, target) VALUES (${newId("event")}, ${ctx.orgId}, ${ctx.userId}, ${action}, ${target})`);
}

export function getCrmLog(ctx: OrgContext, limit = 30) {
  return q<{ id: string; provider: string; direction: string; trigger: string; entity_count: number; counts: Record<string, number> | null; status: string; error: string | null; at: string }>(
    sql`SELECT id, provider, direction, trigger, entity_count, counts, status, error, at FROM crm_sync_log WHERE org_id = ${ctx.orgId} ORDER BY at DESC LIMIT ${Math.min(limit, 200)}`,
  );
}

export type CrmBadge = { status: "IN_CRM" | "NOT_ENRICHED"; providers: string[]; owner: string | null; stage: string | null; openDeals: number; lastActivity: string | null };

/** "In CRM / Not synced / In but not enriched" badges for a page of rows (absent id = not synced). */
export async function getCrmBadges(ctx: OrgContext, ids: string[]): Promise<Record<string, CrmBadge>> {
  if (!ids.length) return {};
  const rows = await q<{ entity_id: string; providers: string[]; owner: string | null; stage: string | null; open_deals: number; last_activity: string | null; enriched: boolean }>(sql`
    SELECT entity_id, array_agg(DISTINCT provider) AS providers, max(owner) AS owner, max(stage) AS stage, max(open_deals)::int AS open_deals,
      max(last_activity) AS last_activity, bool_or(enriched_at IS NOT NULL) AS enriched
    FROM crm_records WHERE org_id = ${ctx.orgId} AND object <> 'DEAL' AND entity_id = ANY(${tarr(ids)}) GROUP BY entity_id`);
  return Object.fromEntries(
    rows.map((r) => [r.entity_id, { status: r.enriched ? "IN_CRM" : "NOT_ENRICHED", providers: r.providers, owner: r.owner, stage: r.stage, openDeals: r.open_deals, lastActivity: r.last_activity }]),
  );
}

/** First connected CRM of the org (default target for one-click "Push to CRM"). */
export async function defaultCrm(ctx: OrgContext): Promise<CrmProvider | null> {
  const [r] = await q<{ provider: CrmProvider }>(sql`SELECT provider FROM crm_connections WHERE org_id = ${ctx.orgId} AND status <> 'PAUSED' ORDER BY created_at LIMIT 1`);
  return r?.provider ?? null;
}

/** Daily job: pull then enrich every connection whose schedule is due. Runs per org with that org's context. */
export async function runScheduledCrmSyncs(opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const due = await q<{ org_id: string; provider: CrmProvider; created_by: string; schedule: CrmSchedule; last_pull_at: string | null }>(sql`
    SELECT org_id, provider, created_by, schedule, last_pull_at FROM crm_connections WHERE schedule <> 'OFF' AND status = 'ACTIVE'`);
  let ran = 0;
  let failed = 0;
  for (const c of due) {
    const ageH = c.last_pull_at ? (now.getTime() - new Date(c.last_pull_at).getTime()) / 3_600_000 : Infinity;
    if (ageH < (c.schedule === "DAILY" ? 20 : 24 * 6.5)) continue;
    const ctx: OrgContext = { orgId: c.org_id, userId: c.created_by, role: "admin" };
    const pull = await runCrmPull(ctx, c.provider, "schedule");
    if (pull.status === "FAILED") {
      failed++;
      continue;
    }
    await enrichCrm(ctx, c.provider, "schedule");
    ran++;
  }
  return { connections: due.length, ran, failed };
}

/** Saved searches with CRM auto-push: push the new matches to the org's default CRM. */
export async function autoPushNewResults(orgId: string, ownerId: string, kind: PushKind, ids: string[], opts: { explicit?: boolean } = {}) {
  const ctx: OrgContext = { orgId, userId: ownerId, role: "member" };
  const [c] = await q<{ provider: CrmProvider; push_config: PushConfig | null }>(sql`SELECT provider, push_config FROM crm_connections WHERE org_id = ${orgId} AND status = 'ACTIVE' ORDER BY created_at LIMIT 1`);
  if (!c || !ids.length || (!opts.explicit && !c.push_config?.autoPushSearches)) return null;
  return pushToCrm(ctx, c.provider, kind, ids, "search");
}
