/**
 * Network tracking (plan 13.2): per-user sources (LinkedIn export CSV, Gmail, Outlook, calendars) →
 * `network_edges` (user → person, strength 0–100) → team-wide deduped views, warm paths, and
 * "{Company} hired from your network" alerts.
 *
 * Privacy: sources are per user and opt-in; only edges (who knows whom, how strongly, via which
 * channel) are stored — never message content, subjects or per-message metadata. Teammates and admins
 * see edges and strength labels, not counts from someone else's inbox.
 */
import {
  MAIL_HOSTS,
  aggregate,
  externalOnly,
  liveMailSource,
  parseLinkedinConnections,
  strength,
  type Channel,
  type Evidence,
  type Interaction,
  type MailProvider,
  type NetworkProvider,
  type Transport,
} from "@founders/integrations";
import { sql } from "drizzle-orm";
import { decryptSecret } from "../crypto";
import { egressFetch } from "../egress";
import { newId } from "../ids";
import { Rng } from "../random";
import { reconcileSystemList } from "./crm";
import { rawQuery as q } from "./entities";
import { NotFoundError, type OrgContext } from "./workspace";

const tarr = (xs: readonly string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(xs)}::jsonb))`;

export { strengthLabel } from "@founders/integrations";

/** Which strength channel each source feeds. */
export const SOURCE_CHANNEL: Record<NetworkProvider, Channel> = { LINKEDIN_CSV: "LINKEDIN", GMAIL: "EMAIL", OUTLOOK: "EMAIL", GCAL: "MEETING", MSCAL: "MEETING" };
export const NETWORK_SOURCE_LABEL: Record<NetworkProvider, string> = { LINKEDIN_CSV: "LinkedIn export", GMAIL: "Gmail", OUTLOOK: "Outlook", GCAL: "Google Calendar", MSCAL: "Microsoft Calendar" };
/** How far back a first mailbox sync reads. */
export const NETWORK_LOOKBACK_DAYS = 365;

type SourceEvidence = Record<string, { count: number; last: string | null }>;

/** Per-source evidence → per-channel evidence (counts summed, latest date kept). */
export function channelEvidence(ev: SourceEvidence): Evidence {
  const out: Evidence = {};
  for (const [src, v] of Object.entries(ev)) {
    const ch = SOURCE_CHANNEL[src as NetworkProvider];
    if (!ch || !v) continue;
    const cur = out[ch] ?? { count: 0, last: null };
    cur.count += v.count;
    if (v.last && (!cur.last || v.last > cur.last)) cur.last = v.last;
    out[ch] = cur;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Writing evidence                                                     */
/* ------------------------------------------------------------------ */

/**
 * Replace this user's evidence from one source with `byPerson`, then recompute strength for every
 * edge of the user. Edges left with no evidence are removed.
 */
async function writeEvidence(ctx: OrgContext, provider: NetworkProvider, byPerson: Map<string, { count: number; last: string | null }>) {
  await q(sql`UPDATE network_edges SET evidence = evidence - ${provider} WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND evidence ? ${provider}`);
  const rows = [...byPerson.entries()].map(([person_id, v]) => ({ person_id, ev: { [provider]: v } }));
  for (let i = 0; i < rows.length; i += 1000) {
    await q(sql`INSERT INTO network_edges (org_id, user_id, person_id, strength, evidence, company_id_at_sync)
      SELECT ${ctx.orgId}, ${ctx.userId}, x.person_id, 0, x.ev, p.current_company_id
      FROM jsonb_to_recordset(${JSON.stringify(rows.slice(i, i + 1000))}::jsonb) AS x(person_id text, ev jsonb) JOIN people p ON p.id = x.person_id
      ON CONFLICT (org_id, user_id, person_id) DO UPDATE SET evidence = network_edges.evidence || EXCLUDED.evidence, updated_at = now()`);
  }
  await recomputeUser(ctx);
}

async function recomputeUser(ctx: OrgContext) {
  await q(sql`DELETE FROM network_edges WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND evidence = '{}'::jsonb`);
  const edges = await q<{ person_id: string; evidence: SourceEvidence }>(sql`SELECT person_id, evidence FROM network_edges WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId}`);
  const now = new Date();
  const updates = edges.map((e) => {
    const ch = channelEvidence(e.evidence);
    const last = Object.values(ch).map((v) => v?.last).filter((d): d is string => !!d).sort().at(-1) ?? null;
    return { person_id: e.person_id, strength: strength(ch, now), last, sources: Object.keys(e.evidence) };
  });
  for (let i = 0; i < updates.length; i += 1000) {
    await q(sql`UPDATE network_edges n SET strength = x.strength, last_interaction_at = x.last::timestamptz, sources = ARRAY(SELECT jsonb_array_elements_text(x.sources))
      FROM jsonb_to_recordset(${JSON.stringify(updates.slice(i, i + 1000))}::jsonb) AS x(person_id text, strength real, last text, sources jsonb)
      WHERE n.org_id = ${ctx.orgId} AND n.user_id = ${ctx.userId} AND n.person_id = x.person_id`);
  }
  await refreshMyNetwork(ctx);
}

async function refreshMyNetwork(ctx: OrgContext) {
  const rows = await q<{ person_id: string }>(sql`SELECT person_id FROM network_edges WHERE org_id = ${ctx.orgId} GROUP BY person_id ORDER BY max(strength) DESC LIMIT 5000`);
  await reconcileSystemList(ctx.orgId, ctx.userId, "MY_NETWORK", "PERSON", rows.map((r) => r.person_id));
}

async function upsertSource(ctx: OrgContext, provider: NetworkProvider, stats: Record<string, number>, auth: string | null = null) {
  await q(sql`INSERT INTO network_sources (id, org_id, user_id, provider, status, auth, stats, last_sync)
    VALUES (${newId("networkSource")}, ${ctx.orgId}, ${ctx.userId}, ${provider}, 'ACTIVE', ${auth}, ${JSON.stringify(stats)}::jsonb, now())
    ON CONFLICT (org_id, user_id, provider) DO UPDATE SET status = 'ACTIVE', stats = EXCLUDED.stats, last_sync = now(), auth = COALESCE(EXCLUDED.auth, network_sources.auth)`);
}

/* ------------------------------------------------------------------ */
/* LinkedIn export                                                      */
/* ------------------------------------------------------------------ */

export type LinkedinImportResult = { rows: number; matched: number; byLinkedin: number; byEmail: number; byNameCompany: number; matchRate: number };

/**
 * Import the member's own LinkedIn `Connections.csv` (plan 13.2). Match quality is limited (emails are
 * usually missing), so we report the match rate. A new upload replaces the previous one.
 */
export async function importLinkedinConnections(ctx: OrgContext, csvText: string): Promise<LinkedinImportResult> {
  const contacts = parseLinkedinConnections(csvText);
  const links = [...new Set(contacts.map((c) => c.linkedinUrl).filter((x): x is string => !!x))];
  const emails = [...new Set(contacts.map((c) => c.email).filter((x): x is string => !!x))];
  const byLink = new Map<string, string>();
  for (let i = 0; i < links.length; i += 5000) {
    const rows = await q<{ id: string; k: string }>(sql`SELECT id, substring(lower(linkedin_url) from 'linkedin\\.(?:com|invalid)/(?:in|company)/[^/?#]+') AS k FROM people
      WHERE deleted_at IS NULL AND substring(lower(linkedin_url) from 'linkedin\\.(?:com|invalid)/(?:in|company)/[^/?#]+') = ANY(${tarr(links.slice(i, i + 5000))})`);
    for (const r of rows) byLink.set(r.k, r.id);
  }
  const byEmail = new Map<string, string>();
  if (emails.length) {
    const rows = await q<{ person_id: string; email: string }>(sql`SELECT person_id, lower(email) AS email FROM person_emails WHERE lower(email) = ANY(${tarr(emails)})`);
    for (const r of rows) byEmail.set(r.email, r.person_id);
  }
  const unresolved = contacts.filter((c) => !(c.linkedinUrl && byLink.has(c.linkedinUrl)) && !(c.email && byEmail.has(c.email)) && c.company);
  const byNameCo = new Map<string, string>();
  if (unresolved.length) {
    const keys = [...new Set(unresolved.map((c) => `${`${c.first} ${c.last}`.trim().toLowerCase()}|${(c.company as string).toLowerCase()}`))];
    const rows = await q<{ id: string; k: string; n: number }>(sql`SELECT min(id) AS id, lower(full_name) || '|' || lower(current_company_name) AS k, count(*)::int AS n FROM people
      WHERE deleted_at IS NULL AND lower(full_name) || '|' || lower(current_company_name) = ANY(${tarr(keys)}) GROUP BY 2`);
    for (const r of rows) if (r.n === 1) byNameCo.set(r.k, r.id);
  }
  const evidence = new Map<string, { count: number; last: string | null }>();
  let viaLink = 0;
  let viaEmail = 0;
  let viaName = 0;
  for (const c of contacts) {
    let pid = c.linkedinUrl ? byLink.get(c.linkedinUrl) : undefined;
    if (pid) viaLink++;
    else if (c.email && (pid = byEmail.get(c.email))) viaEmail++;
    else if (c.company && (pid = byNameCo.get(`${`${c.first} ${c.last}`.trim().toLowerCase()}|${c.company.toLowerCase()}`))) viaName++;
    if (pid) evidence.set(pid, { count: 1, last: c.connectedOn });
  }
  const res: LinkedinImportResult = {
    rows: contacts.length,
    matched: evidence.size,
    byLinkedin: viaLink,
    byEmail: viaEmail,
    byNameCompany: viaName,
    matchRate: contacts.length ? Math.round((1000 * evidence.size) / contacts.length) / 10 : 0,
  };
  await writeEvidence(ctx, "LINKEDIN_CSV", evidence);
  await upsertSource(ctx, "LINKEDIN_CSV", res);
  return res;
}

/* ------------------------------------------------------------------ */
/* Mailboxes & calendars                                                */
/* ------------------------------------------------------------------ */

/** Turn interactions into per-person evidence by matching addresses to known emails. */
export async function ingestInteractions(ctx: OrgContext, provider: MailProvider, items: Interaction[], ownDomains: string[], extraStats: Record<string, number> = {}) {
  const agg = aggregate(externalOnly(items.map((i) => ({ ...i, email: i.email.trim().toLowerCase() })), ownDomains));
  const emails = [...agg.keys()];
  const byEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 5000) {
    const rows = await q<{ person_id: string; email: string }>(sql`SELECT person_id, lower(email) AS email FROM person_emails WHERE lower(email) = ANY(${tarr(emails.slice(i, i + 5000))})`);
    for (const r of rows) byEmail.set(r.email, r.person_id);
  }
  const channel = SOURCE_CHANNEL[provider] as "EMAIL" | "MEETING";
  const evidence = new Map<string, { count: number; last: string | null }>();
  for (const [email, a] of agg) {
    const pid = byEmail.get(email);
    const ev = a[channel];
    if (!pid || !ev) continue;
    const cur = evidence.get(pid) ?? { count: 0, last: null };
    cur.count += ev.count;
    if (!cur.last || ev.last > cur.last) cur.last = ev.last;
    evidence.set(pid, cur);
  }
  await writeEvidence(ctx, provider, evidence);
  const stats = { contacts: agg.size, matched: evidence.size, interactions: items.length, matchRate: agg.size ? Math.round((1000 * evidence.size) / agg.size) / 10 : 0, ...extraStats };
  await upsertSource(ctx, provider, stats);
  return stats;
}

/**
 * Demo mailbox: until Google/Microsoft verification (H10) lets users connect real accounts, a demo
 * source generates a year of metadata-only interactions with founders and executives at companies
 * in the workspace's lists, so warm paths and alerts can be tried end to end. Labelled as demo.
 */
export async function connectDemoMailbox(ctx: OrgContext, provider: MailProvider) {
  const people = await q<{ email: string; full_name: string }>(sql`
    WITH listed AS (SELECT DISTINCT li.entity_id FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND l.entity_type = 'COMPANY')
    SELECT DISTINCT ON (p.id) e.email, p.full_name FROM people p JOIN person_emails e ON e.person_id = p.id
    WHERE p.deleted_at IS NULL AND p.seniority IN ('Founder', 'C-Level', 'VP') AND p.current_company_id IN (SELECT entity_id FROM listed)
    ORDER BY p.id LIMIT 400`);
  const seed = [...`${ctx.userId}:${provider}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rng = new Rng(seed);
  const rnd = () => rng.next();
  const now = Date.now();
  const items: Interaction[] = [];
  const channel = SOURCE_CHANNEL[provider] as "EMAIL" | "MEETING";
  for (const p of people) {
    if (rnd() > 0.45) continue; // each user knows a different ~45 %
    const n = channel === "EMAIL" ? 1 + Math.floor(rnd() * rnd() * 30) : 1 + Math.floor(rnd() * 6);
    const recency = rnd() * rnd() * 330;
    for (let k = 0; k < n; k++) items.push({ email: p.email.toLowerCase(), name: p.full_name, at: new Date(now - (recency + rnd() * 30) * 86_400_000).toISOString(), channel });
  }
  return ingestInteractions(ctx, provider, items, [], { demo: 1 });
}

/** Live sync for sources that hold a token (OAuth after H10). Test seam: transport. */
export async function syncMailSource(ctx: OrgContext, provider: MailProvider, opts: { transport?: Transport; ownDomains?: string[] } = {}) {
  const [s] = await q<{ auth: string | null; last_sync: string | null }>(sql`SELECT auth, last_sync FROM network_sources WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND provider = ${provider}`);
  if (!s?.auth) throw new NotFoundError(`${NETWORK_SOURCE_LABEL[provider]} is not connected`);
  const token = decryptSecret(s.auth);
  const transport: Transport =
    opts.transport ??
    (async (req) => {
      const r = await egressFetch(req.url, { method: req.method, headers: req.headers }, { allowHosts: MAIL_HOSTS[provider], timeoutMs: 15_000, maxBytes: 4 * 1024 * 1024 });
      return { status: r.status, body: r.body };
    });
  const source = liveMailSource(provider, token, transport);
  const since = new Date(Date.now() - NETWORK_LOOKBACK_DAYS * 86_400_000).toISOString();
  const items: Interaction[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await source.list(since, cursor);
    items.push(...page.items);
    cursor = page.next;
  } while (cursor && ++pages < 50);
  const [u] = await q<{ email: string }>(sql`SELECT email FROM "user" WHERE id = ${ctx.userId}`);
  const own = [...new Set([...(opts.ownDomains ?? []), u?.email.split("@")[1] ?? ""].filter(Boolean))];
  return ingestInteractions(ctx, provider, items, own);
}

export async function removeNetworkSource(ctx: OrgContext, provider: NetworkProvider) {
  await q(sql`DELETE FROM network_sources WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND provider = ${provider}`);
  await q(sql`UPDATE network_edges SET evidence = evidence - ${provider} WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId}`);
  await recomputeUser(ctx);
}

/** The signed-in user's own sources (never someone else's). */
export function getMyNetworkSources(ctx: OrgContext) {
  return q<{ provider: NetworkProvider; status: string; stats: Record<string, number> | null; last_sync: string | null }>(
    sql`SELECT provider, status, stats, last_sync FROM network_sources WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} ORDER BY provider`,
  );
}

/* ------------------------------------------------------------------ */
/* Team views (plan 11 #64–67)                                          */
/* ------------------------------------------------------------------ */

export type Teammate = { user_id: string; name: string; strength: number; sources: string[]; last_interaction_at: string | null };

/** #64 People the team knows, deduped across teammates, strongest first. */
export function networkPeople(ctx: OrgContext, opts: { limit?: number; offset?: number } = {}) {
  return q<{ person_id: string; full_name: string; current_title: string | null; company_id: string | null; company_name: string | null; strength: number; team_connections: number; last_interaction_at: string | null; teammates: Teammate[] }>(sql`
    SELECT p.id AS person_id, p.full_name, p.current_title, p.current_company_id AS company_id, p.current_company_name AS company_name,
      max(e.strength) AS strength, count(*)::int AS team_connections, max(e.last_interaction_at) AS last_interaction_at,
      jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'strength', e.strength, 'sources', e.sources, 'last_interaction_at', e.last_interaction_at) ORDER BY e.strength DESC) AS teammates
    FROM network_edges e JOIN people p ON p.id = e.person_id JOIN "user" u ON u.id = e.user_id
    JOIN member m ON m.user_id = e.user_id AND m.organization_id = e.org_id
    WHERE e.org_id = ${ctx.orgId}
    GROUP BY p.id ORDER BY max(e.strength) DESC, p.id LIMIT ${Math.min(opts.limit ?? 5000, 5000)} OFFSET ${opts.offset ?? 0}`);
}

/** #65 Companies reachable through the team, ranked by how many people the team knows there. */
export function networkCompanies(ctx: OrgContext, opts: { limit?: number; offset?: number } = {}) {
  return q<{ company_id: string; name: string; domain: string; people: number; teammates: number; best_strength: number }>(sql`
    SELECT c.id AS company_id, c.name, c.domain, count(DISTINCT e.person_id)::int AS people, count(DISTINCT e.user_id)::int AS teammates, max(e.strength) AS best_strength
    FROM network_edges e JOIN people p ON p.id = e.person_id JOIN companies c ON c.id = p.current_company_id
    JOIN member m ON m.user_id = e.user_id AND m.organization_id = e.org_id
    WHERE e.org_id = ${ctx.orgId}
    GROUP BY c.id ORDER BY count(DISTINCT e.person_id) DESC, max(e.strength) DESC, c.id LIMIT ${Math.min(opts.limit ?? 5000, 5000)} OFFSET ${opts.offset ?? 0}`);
}

/** #66 Who on the team knows this person, and how well. */
export function connectionsFor(ctx: OrgContext, personId: string) {
  return q<Teammate>(sql`SELECT u.id AS user_id, u.name, e.strength, e.sources, e.last_interaction_at FROM network_edges e
    JOIN "user" u ON u.id = e.user_id JOIN member m ON m.user_id = e.user_id AND m.organization_id = e.org_id
    WHERE e.org_id = ${ctx.orgId} AND e.person_id = ${personId} ORDER BY e.strength DESC`);
}

/** Team connections at one company (company profile header). */
export function companyConnections(ctx: OrgContext, companyId: string) {
  return q<{ person_id: string; full_name: string; current_title: string | null; user_id: string; user_name: string; strength: number }>(sql`
    SELECT p.id AS person_id, p.full_name, p.current_title, u.id AS user_id, u.name AS user_name, e.strength
    FROM network_edges e JOIN people p ON p.id = e.person_id JOIN "user" u ON u.id = e.user_id JOIN member m ON m.user_id = e.user_id AND m.organization_id = e.org_id
    WHERE e.org_id = ${ctx.orgId} AND p.current_company_id = ${companyId} ORDER BY e.strength DESC LIMIT 50`);
}

/** #67 Teammates with connected sources (provider + last sync + edge count; no inbox detail). */
export async function networkMembers(ctx: OrgContext) {
  return q<{ user_id: string; name: string; sources: { provider: string; last_sync: string | null }[]; connections: number }>(sql`
    SELECT u.id AS user_id, u.name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('provider', s.provider, 'last_sync', s.last_sync) ORDER BY s.provider) FROM network_sources s WHERE s.org_id = m.organization_id AND s.user_id = u.id), '[]'::jsonb) AS sources,
      (SELECT count(*)::int FROM network_edges e WHERE e.org_id = m.organization_id AND e.user_id = u.id) AS connections
    FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.organization_id = ${ctx.orgId} ORDER BY u.name`);
}

export type WarmPath = { company_id: string; company_name: string; paths: { teammate: string; teammate_id: string; person_id: string; person: string; title: string | null; strength: number }[] };

/** Warmest paths into each target company: direct team connections who work there now, strongest first. */
export async function warmPaths(ctx: OrgContext, target: { companyIds?: string[]; listId?: string }, perCompany = 3): Promise<WarmPath[]> {
  let ids = target.companyIds ?? [];
  if (target.listId) {
    const rows = await q<{ entity_id: string }>(sql`SELECT li.entity_id FROM list_items li JOIN lists l ON l.id = li.list_id
      WHERE l.id = ${target.listId} AND l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND l.entity_type = 'COMPANY'`);
    if (!rows.length) {
      const [exists] = await q(sql`SELECT 1 FROM lists WHERE id = ${target.listId} AND org_id = ${ctx.orgId} AND deleted_at IS NULL`);
      if (!exists) throw new NotFoundError("List not found");
    }
    ids = rows.map((r) => r.entity_id);
  }
  if (!ids.length) return [];
  const rows = await q<{ company_id: string; company_name: string; teammate: string; teammate_id: string; person_id: string; person: string; title: string | null; strength: number; rn: number }>(sql`
    SELECT * FROM (
      SELECT c.id AS company_id, c.name AS company_name, u.name AS teammate, u.id AS teammate_id, p.id AS person_id, p.full_name AS person, p.current_title AS title, e.strength,
        row_number() OVER (PARTITION BY c.id ORDER BY e.strength DESC) AS rn
      FROM network_edges e JOIN people p ON p.id = e.person_id JOIN companies c ON c.id = p.current_company_id
      JOIN "user" u ON u.id = e.user_id JOIN member m ON m.user_id = e.user_id AND m.organization_id = e.org_id
      WHERE e.org_id = ${ctx.orgId} AND c.id = ANY(${tarr(ids)})) x
    WHERE rn <= ${perCompany} ORDER BY strength DESC`);
  const out = new Map<string, WarmPath>();
  for (const r of rows) {
    const w = out.get(r.company_id) ?? { company_id: r.company_id, company_name: r.company_name, paths: [] };
    w.paths.push({ teammate: r.teammate, teammate_id: r.teammate_id, person_id: r.person_id, person: r.person, title: r.title, strength: r.strength });
    out.set(r.company_id, w);
  }
  return [...out.values()].sort((a, b) => (b.paths[0]?.strength ?? 0) - (a.paths[0]?.strength ?? 0));
}

/* ------------------------------------------------------------------ */
/* Move alerts                                                          */
/* ------------------------------------------------------------------ */

/**
 * "{Company} hired from your network" (plan 13.2 / 7.11): when a connected person's current company
 * changes, notify each teammate who knows them, then move the edge's baseline.
 */
export async function processNetworkMoves() {
  const moves = await q<{ org_id: string; user_id: string; person_id: string; full_name: string; company_id: string; company_name: string; prev_company: string | null }>(sql`
    SELECT e.org_id, e.user_id, e.person_id, p.full_name, p.current_company_id AS company_id, c.name AS company_name, pc.name AS prev_company
    FROM network_edges e JOIN people p ON p.id = e.person_id JOIN companies c ON c.id = p.current_company_id LEFT JOIN companies pc ON pc.id = e.company_id_at_sync
    WHERE p.current_company_id IS NOT NULL AND e.company_id_at_sync IS DISTINCT FROM p.current_company_id LIMIT 5000`);
  for (const m of moves) {
    await q(sql`INSERT INTO notifications (id, org_id, user_id, kind, payload) VALUES (${newId("notification")}, ${m.org_id}, ${m.user_id}, 'network.move',
      ${JSON.stringify({ personId: m.person_id, name: m.full_name, companyId: m.company_id, company: m.company_name, previous: m.prev_company, text: `${m.company_name} hired ${m.full_name} from your network` })}::jsonb)`);
    await q(sql`UPDATE network_edges SET company_id_at_sync = ${m.company_id} WHERE org_id = ${m.org_id} AND user_id = ${m.user_id} AND person_id = ${m.person_id}`);
  }
  return { moves: moves.length };
}

/** Daily: re-sync every token-holding mail/calendar source (OAuth sources after H10). */
export async function syncAllNetworkSources() {
  const rows = await q<{ org_id: string; user_id: string; provider: MailProvider; role: string }>(sql`
    SELECT s.org_id, s.user_id, s.provider, m.role FROM network_sources s JOIN member m ON m.user_id = s.user_id AND m.organization_id = s.org_id
    WHERE s.auth IS NOT NULL AND s.status = 'ACTIVE' AND s.provider <> 'LINKEDIN_CSV'`);
  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await syncMailSource({ orgId: r.org_id, userId: r.user_id, role: r.role as OrgContext["role"] }, r.provider);
      ok++;
    } catch (e) {
      failed++;
      await q(sql`UPDATE network_sources SET status = 'ERROR', stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{error}', to_jsonb(${e instanceof Error ? e.message : String(e)}::text)) WHERE org_id = ${r.org_id} AND user_id = ${r.user_id} AND provider = ${r.provider}`);
    }
  }
  return { sources: rows.length, synced: ok, failed };
}
