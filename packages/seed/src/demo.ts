/**
 * Demo workspace: org + user (password login), statuses, lists, saved searches with
 * "new since last read" results, credits, an active API key and a few notifications.
 */
import type postgres from "postgres";
import { createSavedSearch, refreshSavedSearch, type OrgContext } from "@founders/core/repo";
import { TAXONOMY } from "@founders/core/taxonomy";

type Sample = {
  companyIdsByCountry: (country: string) => string[];
  topCompanyIds: string[];
  founderIds: string[];
  tier1InvestorIds: string[];
};

export const DEMO = {
  email: "demo@foundersscz.com",
  password: "founders-demo",
  name: "Demo Analyst",
  orgName: "Founders SCZ (Demo)",
  apiKey: "fai_demo_local_only_9f3c2b7a1e5d4c8b",
};

const sectorId = (name: string) => TAXONOMY.sectors.find((s) => s.name === name)?.id ?? "";
const verticalId = (name: string) => TAXONOMY.verticals.find((s) => s.name === name)?.id ?? "";

export async function seedDemoWorkspace(
  sql: postgres.Sql,
  sample: Sample,
  deps: { hashPassword: (p: string) => Promise<string>; hashKey: (k: string) => string; random: (n: number) => string },
) {
  const userId = "usr_demo000000000000000000001";
  const user2 = "usr_demo000000000000000000002";
  const orgId = "org_demo000000000000000000001";
  const org2 = "org_demo000000000000000000002";

  // Clean previous demo rows (workspace tables are not truncated by the dataset seed).
  // audit_log is append-only (migration 0009); the reseed is a sanctioned maintenance path.
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
    await tx`DELETE FROM audit_log WHERE org_id IN (${orgId}, ${org2})`;
  });
  for (const t of ["list_items", "search_result_snapshots", "search_reads"]) await sql.unsafe(`DELETE FROM ${t}`);
  for (const t of ["lists", "saved_searches", "org_statuses", "entity_status", "likes", "hides", "notes", "notifications", "api_keys", "credit_ledger", "usage_events", "digest_runs"])
    await sql.unsafe(`DELETE FROM ${t} WHERE org_id IN ('${orgId}', '${org2}')`);
  await sql`DELETE FROM credit_balances WHERE org_id IN (${orgId}, ${org2})`;
  await sql`DELETE FROM member WHERE organization_id IN (${orgId}, ${org2})`;
  await sql`DELETE FROM organization WHERE id IN (${orgId}, ${org2})`;
  await sql`DELETE FROM account WHERE user_id IN (${userId}, ${user2})`;
  await sql`DELETE FROM session WHERE user_id IN (${userId}, ${user2})`;
  await sql`DELETE FROM "user" WHERE id IN (${userId}, ${user2})`;

  const hash = await deps.hashPassword(DEMO.password);
  await sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${userId}, ${DEMO.name}, ${DEMO.email}, true),
    (${user2}, 'Second Teammate', 'teammate@foundersscz.com', true)`;
  await sql`INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES
    (${`acc_${deps.random(12)}`}, ${userId}, 'credential', ${userId}, ${hash}),
    (${`acc_${deps.random(12)}`}, ${user2}, 'credential', ${user2}, ${hash})`;
  const thesis = { role: "Investor", firmType: "VC", sectors: [sectorId("Financial Services"), sectorId("Agriculture & Food Systems")], stages: ["Pre-seed / Seed", "Early"], geographies: ["Latin America"], checkSize: "$100K–$1M" };
  await sql`INSERT INTO organization (id, name, slug, plan, seats, thesis) VALUES
    (${orgId}, ${DEMO.orgName}, 'founders-demo', 'platform', 10, ${sql.json(thesis)}),
    (${org2}, 'Other Workspace (tenancy test)', 'other-workspace', 'trial', 3, NULL)`;
  await sql`INSERT INTO member (id, organization_id, user_id, role) VALUES
    (${`mem_${deps.random(12)}`}, ${orgId}, ${userId}, 'owner'),
    (${`mem_${deps.random(12)}`}, ${orgId}, ${user2}, 'member'),
    (${`mem_${deps.random(12)}`}, ${org2}, ${user2}, 'owner')`;

  const statuses = [
    ["New", "#a3a3a3"],
    ["Reviewing", "#60a5fa"],
    ["Contacted", "#d8ff4a"],
    ["Pass", "#f87171"],
    ["In CRM", "#34d399"],
  ];
  for (const [i, [label, color]] of statuses.entries())
    await sql`INSERT INTO org_statuses (id, org_id, label, color, "order") VALUES (${`sts_${deps.random(12)}`}, ${orgId}, ${label as string}, ${color as string}, ${i})`;

  await sql`INSERT INTO credit_balances (org_id, balance) VALUES (${orgId}, 5000), (${org2}, 200)`;
  await sql`INSERT INTO credit_ledger (id, org_id, delta, reason) VALUES (${`cle_${deps.random(12)}`}, ${orgId}, 5000, 'seed_grant'), (${`cle_${deps.random(12)}`}, ${orgId}, 0, 'api_trial')`;
  await sql`INSERT INTO api_keys (id, org_id, user_id, name, prefix, hash, scopes, status) VALUES
    (${`key_${deps.random(12)}`}, ${orgId}, ${userId}, 'Local demo key', ${DEMO.apiKey.slice(0, 10)}, ${deps.hashKey(DEMO.apiKey)},
     ${["read:data", "write:lists", "write:searches"]}, 'ACTIVE')`;

  // Lists
  const lists: { id: string; name: string; type: string; system: string | null; ids: string[] }[] = [
    { id: `lst_${deps.random(12)}`, name: "Portfolio companies", type: "COMPANY", system: null, ids: sample.topCompanyIds.slice(0, 28) },
    { id: `lst_${deps.random(12)}`, name: "Bolivia watchlist", type: "COMPANY", system: null, ids: sample.companyIdsByCountry("Bolivia").slice(0, 40) },
    { id: `lst_${deps.random(12)}`, name: "Founders to watch", type: "PERSON", system: null, ids: sample.founderIds.slice(0, 12) },
    { id: `lst_${deps.random(12)}`, name: "Tier-1 co-investors", type: "INVESTOR", system: null, ids: sample.tier1InvestorIds.slice(0, 20) },
    { id: `lst_${deps.random(12)}`, name: "My CRM", type: "COMPANY", system: "MY_CRM", ids: sample.topCompanyIds.slice(30, 90) },
    { id: `lst_${deps.random(12)}`, name: "My Network", type: "PERSON", system: "MY_NETWORK", ids: sample.founderIds.slice(20, 60) },
    { id: `lst_${deps.random(12)}`, name: "Liked", type: "COMPANY", system: "LIKED", ids: [] },
  ];
  for (const l of lists) {
    await sql`INSERT INTO lists (id, org_id, owner_id, name, entity_type, visibility, system) VALUES (${l.id}, ${orgId}, ${userId}, ${l.name}, ${l.type}, 'TEAM', ${l.system})`;
    for (const e of l.ids) await sql`INSERT INTO list_items (list_id, entity_type, entity_id, added_by) VALUES (${l.id}, ${l.type}, ${e}, ${userId}) ON CONFLICT DO NOTHING`;
  }
  // A list in the other org — must never be visible from the demo org.
  await sql`INSERT INTO lists (id, org_id, owner_id, name, entity_type) VALUES ('lst_other_org_secret_0000001', ${org2}, ${user2}, 'Other org secret list', 'COMPANY')`;

  // Saved searches (created through the repo so filters are validated and snapshotted).
  const ctx: OrgContext = { orgId, userId, role: "owner" };
  const searches = [
    {
      name: "Seed fintech in Bolivia",
      product: "companies" as const,
      filter: { kind: "group" as const, op: "AND" as const, children: [
        { kind: "condition" as const, field: "hq_country", operator: "any_of" as const, value: ["Bolivia"] },
        { kind: "condition" as const, field: "sector", operator: "any_of" as const, value: [sectorId("Financial Services")] },
      ] },
    },
    {
      name: "AI agents with headcount surge",
      product: "companies" as const,
      filter: { kind: "group" as const, op: "AND" as const, children: [
        { kind: "condition" as const, field: "tech_vertical", operator: "any_of" as const, value: [verticalId("AI Agents and Process Copilots")] },
        { kind: "condition" as const, field: "headcount_growth_3m", operator: "gte" as const, value: 10 },
      ] },
    },
    {
      name: "LatAm agtech — Pre-seed / Seed",
      product: "companies" as const,
      filter: { kind: "group" as const, op: "AND" as const, children: [
        { kind: "condition" as const, field: "hq_region", operator: "any_of" as const, value: ["Latin America"] },
        { kind: "condition" as const, field: "sector", operator: "any_of" as const, value: [sectorId("Agriculture & Food Systems")] },
        { kind: "condition" as const, field: "growth_stage", operator: "any_of" as const, value: ["Pre-seed / Seed"] },
      ] },
    },
    {
      name: "Serial founders in Latin America",
      product: "people" as const,
      filter: { kind: "group" as const, op: "AND" as const, children: [
        { kind: "condition" as const, field: "highlights", operator: "any_of" as const, value: ["Serial Founder"] },
        { kind: "condition" as const, field: "seniority", operator: "any_of" as const, value: ["Founder"] },
      ] },
    },
    {
      name: "Stealth founders — last 30 days",
      product: "talent_signals" as const,
      filter: { kind: "group" as const, op: "AND" as const, children: [
        { kind: "condition" as const, field: "status", operator: "any_of" as const, value: ["STEALTH"] },
        { kind: "condition" as const, field: "signal_date", operator: "within_last_days" as const, value: 30 },
      ] },
    },
    {
      name: "Series A rounds — last 90 days",
      product: "funding_rounds" as const,
      filter: { kind: "group" as const, op: "AND" as const, children: [
        { kind: "condition" as const, field: "type", operator: "any_of" as const, value: ["Series A"] },
        { kind: "condition" as const, field: "announced_date", operator: "within_last_days" as const, value: 90 },
      ] },
    },
  ];
  for (const s of searches) {
    const created = await createSavedSearch(ctx, { name: s.name, product: s.product, filter: s.filter, alertCadence: "DAILY" });
    // Simulate ingestion since the last read: drop ~12% of the snapshot, backdate the rest and the read
    // marker, then refresh so the dropped results reappear as "new".
    await sql`UPDATE saved_searches SET created_at = now() - interval '14 days' WHERE id = ${created.id}`;
    await sql`DELETE FROM search_result_snapshots WHERE search_id = ${created.id} AND entity_id IN (
      SELECT entity_id FROM search_result_snapshots WHERE search_id = ${created.id} ORDER BY random() LIMIT GREATEST(1, LEAST(40, (SELECT count(*) / 8 FROM search_result_snapshots WHERE search_id = ${created.id}))))`;
    await sql`UPDATE search_result_snapshots SET first_seen_at = now() - interval '10 days' WHERE search_id = ${created.id}`;
    await sql`UPDATE search_reads SET last_read_at = now() - interval '2 days' WHERE search_id = ${created.id}`;
    const r = await refreshSavedSearch(ctx, created.id);
    await sql`INSERT INTO notifications (id, org_id, user_id, kind, payload) VALUES (${`ntf_${deps.random(12)}`}, ${orgId}, ${userId}, 'search.new_results',
      ${sql.json({ searchId: created.id, name: s.name, count: r.added })})`;
  }
}
