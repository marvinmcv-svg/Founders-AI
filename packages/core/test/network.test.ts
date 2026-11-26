/**
 * Network tracking against the seeded DB (skipped without one): LinkedIn export import with match
 * rate, mailbox interactions → edges and strength, team views, warm paths, move alerts, removal,
 * and tenancy. Writes happen in the tenancy-test workspace only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const B: repo.OrgContext = { orgId: "org_demo000000000000000000002", userId: "usr_demo000000000000000000002", role: "owner" };
const A: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
let dbUp = false;
type P = { id: string; full_name: string; linkedin_url: string; current_company_id: string; current_company_name: string; email: string };
let people: P[] = [];

async function cleanup() {
  await getSql()`DELETE FROM network_edges WHERE org_id = ${B.orgId}`;
  await getSql()`DELETE FROM network_sources WHERE org_id = ${B.orgId}`;
  await getSql()`DELETE FROM notifications WHERE org_id = ${B.orgId} AND kind = 'network.move'`;
}

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM network_edges LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  await cleanup();
  people = (await getSql()`SELECT p.id, p.full_name, p.linkedin_url, p.current_company_id, p.current_company_name, e.email
    FROM people p JOIN person_emails e ON e.person_id = p.id WHERE p.current_company_id IS NOT NULL AND p.linkedin_url IS NOT NULL ORDER BY p.id LIMIT 6`) as unknown as P[];
});
afterAll(async () => {
  if (dbUp) await cleanup();
  await getSql().end({ timeout: 1 });
});

const csv = (rows: string[]) => `Notes:\n"Some emails are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\n${rows.join("\n")}\n`;

describe("network", () => {
  it("imports a LinkedIn export, reports the match rate and builds edges", async () => {
    if (!dbUp) return;
    const [p0, p1, p2] = people as [P, P, P];
    const [f2, ...l2] = p2.full_name.split(" ");
    const res = await repo.importLinkedinConnections(
      B,
      csv([
        `${p0.full_name.split(" ")[0]},x,${p0.linkedin_url.replace("demo.", "www.")},,Somewhere,CEO,05 Mar 2024`,
        `a,b,,${p1.email},,,10 Jan 2025`,
        `${f2},${l2.join(" ")},,,${p2.current_company_name},Founder,01 Jun 2020`,
        `Nobody,Known,https://www.linkedin.com/in/nobody-known-000,,Ghost Co,CTO,01 Jun 2020`,
      ]),
    );
    expect(res).toMatchObject({ rows: 4, matched: 3, byLinkedin: 1, byEmail: 1, byNameCompany: 1, matchRate: 75 });
    const mine = await repo.getMyNetworkSources(B);
    expect(mine.map((s) => s.provider)).toEqual(["LINKEDIN_CSV"]);
    const conn = await repo.connectionsFor(B, p0.id);
    expect(conn).toHaveLength(1);
    expect(conn[0]?.strength).toBeGreaterThan(0);
    expect(conn[0]?.sources).toEqual(["LINKEDIN_CSV"]);
  });

  it("mailbox interactions strengthen edges; own-domain and automated senders are ignored", async () => {
    if (!dbUp) return;
    const [p0, , , p3] = people as [P, P, P, P];
    const before = (await repo.connectionsFor(B, p0.id))[0]?.strength ?? 0;
    const now = Date.now();
    const at = (d: number) => new Date(now - d * 86_400_000).toISOString();
    const stats = await repo.ingestInteractions(
      B,
      "GMAIL",
      [
        ...Array.from({ length: 12 }, (_, i) => ({ email: p0.email, name: null, at: at(i * 3), channel: "EMAIL" as const })),
        { email: p3.email.toUpperCase(), name: null, at: at(40), channel: "EMAIL" as const },
        { email: "partner@ourfund.example", name: null, at: at(1), channel: "EMAIL" as const },
        { email: "no-reply@service.example", name: null, at: at(1), channel: "EMAIL" as const },
      ],
      ["ourfund.example"],
    );
    expect(stats.matched).toBe(2);
    const after = (await repo.connectionsFor(B, p0.id))[0];
    expect(after?.strength).toBeGreaterThan(before);
    expect(after?.sources?.sort()).toEqual(["GMAIL", "LINKEDIN_CSV"]);

    const ppl = await repo.networkPeople(B);
    expect(ppl[0]?.person_id).toBe(p0.id); // strongest first
    expect(new Set(ppl.map((x) => x.person_id)).size).toBe(ppl.length); // deduped
    const cos = await repo.networkCompanies(B);
    expect(cos.some((c) => c.company_id === p0.current_company_id)).toBe(true);
    const members = await repo.networkMembers(B);
    expect(members.find((m) => m.user_id === B.userId)?.connections).toBe(ppl.length);
  });

  it("warm paths, network filters, My Network list and tenancy", async () => {
    if (!dbUp) return;
    const [p0] = people as [P];
    const paths = await repo.warmPaths(B, { companyIds: [p0.current_company_id] });
    expect(paths[0]?.paths[0]).toMatchObject({ person_id: p0.id, teammate_id: B.userId });
    expect(await repo.warmPaths(A, { companyIds: [p0.current_company_id] })).toEqual([]);
    expect(await repo.connectionsFor(A, p0.id)).toEqual([]);

    const f = { kind: "group" as const, op: "AND" as const, children: [{ kind: "condition" as const, field: "network_connected", operator: "is_true" as const }] };
    expect((await repo.searchEntities("people", { filter: f, orgId: B.orgId, limit: 50 })).rows.map((r) => r.id)).toContain(p0.id);
    expect((await repo.searchEntities("companies", { filter: f, orgId: B.orgId, limit: 50 })).rows.map((r) => r.id)).toContain(p0.current_company_id);
    expect((await repo.searchEntities("people", { filter: f, orgId: A.orgId, limit: 50 })).rows.map((r) => r.id)).not.toContain(p0.id);

    const [list] = await getSql()`SELECT count(*)::int AS n FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.org_id = ${B.orgId} AND l.system = 'MY_NETWORK'`;
    expect(list?.n).toBe((await repo.networkPeople(B)).length);
  });

  it("alerts the team when a connection changes company, once", async () => {
    if (!dbUp) return;
    const [p0, , , , p4] = people as [P, P, P, P, P];
    await getSql()`UPDATE people SET current_company_id = ${p4.current_company_id} WHERE id = ${p0.id}`;
    try {
      const r = await repo.processNetworkMoves();
      expect(r.moves).toBeGreaterThanOrEqual(1);
      const [n] = await getSql()`SELECT payload FROM notifications WHERE org_id = ${B.orgId} AND kind = 'network.move' ORDER BY created_at DESC LIMIT 1`;
      expect((n?.payload as { personId: string }).personId).toBe(p0.id);
      const count = async () => (await getSql()`SELECT count(*)::int AS n FROM notifications WHERE org_id = ${B.orgId} AND kind = 'network.move'`)[0]?.n;
      const first = await count();
      await repo.processNetworkMoves();
      expect(await count()).toBe(first); // baseline moved: no repeat alert
      expect((await getSql()`SELECT count(*)::int AS n FROM network_edges WHERE org_id = ${B.orgId} AND person_id = ${p0.id} AND company_id_at_sync = ${p4.current_company_id}`)[0]?.n).toBe(1);
    } finally {
      await getSql()`UPDATE people SET current_company_id = ${p0.current_company_id} WHERE id = ${p0.id}`;
      await getSql()`UPDATE network_edges SET company_id_at_sync = ${p0.current_company_id} WHERE person_id = ${p0.id} AND org_id = ${B.orgId}`;
    }
  });

  it("removing a source drops its evidence and empty edges", async () => {
    if (!dbUp) return;
    const [p0, p1] = people as [P, P];
    await repo.removeNetworkSource(B, "LINKEDIN_CSV");
    expect((await repo.connectionsFor(B, p0.id))[0]?.sources).toEqual(["GMAIL"]);
    expect(await repo.connectionsFor(B, p1.id)).toEqual([]); // LinkedIn-only edge is gone
    expect((await repo.getMyNetworkSources(B)).map((s) => s.provider)).toEqual(["GMAIL"]);
  });
});
