/** Plan 9.1 entity resolution against Postgres: block → score → auto-merge / queue / reject (D-072). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
process.env.PLATFORM_ADMIN_EMAILS = "ops@founders.test";
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const OPS: repo.AdminContext = { email: "ops@founders.test", userId: "usr_ops" };
const C = {
  rich: "com_restest00000000000000a1", // Ripio-like, has a round: survivor
  dup: "com_restest00000000000000a2", // same domain under an alias form
  twin: "com_restest00000000000000b1", // same name + city, different domain: review
  twin2: "com_restest00000000000000b2",
  other: "com_restest00000000000000c1", // namesake abroad: ignored
  other2: "com_restest00000000000000c2",
};
const P = { a: "per_restest00000000000000a1", b: "per_restest00000000000000a2", c: "per_restest00000000000000b1", d: "per_restest00000000000000b2" };
const ALL = [...Object.values(C), ...Object.values(P)];
let dbUp = false;

async function cleanup() {
  const s = getSql();
  await s`DELETE FROM entity_match_candidates WHERE left_id = ANY(${ALL}) OR right_id = ANY(${ALL})`;
  await s`DELETE FROM person_emails WHERE person_id = ANY(${Object.values(P)})`;
  await s`DELETE FROM people WHERE id = ANY(${Object.values(P)})`;
  await s`DELETE FROM funding_rounds WHERE company_id = ANY(${Object.values(C)})`;
  await s`DELETE FROM outbox_events WHERE entity_id = ANY(${ALL})`;
  await s`DELETE FROM companies WHERE id = ANY(${Object.values(C)})`;
}

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM entity_match_candidates LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  await cleanup();
  const s = getSql();
  await s`INSERT INTO companies (id, name, domain, domain_aliases, hq_country, hq_city, founded_year, growth_stage, round_count) VALUES
    (${C.rich}, 'Restest Pagos', 'restestpagos.com', '{"restestpagos.com.bo"}', 'Bolivia', 'Santa Cruz', 2019, 'SEED', 1),
    (${C.dup}, 'Restest Pagos S.A.', 'restestpagos.com.bo', '{}', 'Bolivia', 'Santa Cruz', 2019, 'SEED', 0),
    (${C.twin}, 'Restwin Labs', 'restwin.io', '{}', 'Bolivia', 'La Paz', 2020, 'SEED', 0),
    (${C.twin2}, 'Restwin Labs', 'restwinlabs.com', '{}', 'Bolivia', 'La Paz', 2020, 'SEED', 0),
    (${C.other}, 'Resother Pay', 'resother.mx', '{}', 'Mexico', 'CDMX', 2015, 'SEED', 0),
    (${C.other2}, 'Resother Pay', 'resother.de', '{}', 'Germany', 'Berlin', 2022, 'SEED', 0)`;
  await s`INSERT INTO funding_rounds (id, company_id, type, announced_date) VALUES ('trx_restest0000000000000001', ${C.dup}, 'SEED', '2024-01-01')`;
  await s`INSERT INTO people (id, full_name, first, last, current_company_id, country, current_title, talent_signal_count) VALUES
    (${P.a}, 'Restina Quispe', 'Restina', 'Quispe', ${C.rich}, 'Bolivia', 'CEO', 3),
    (${P.b}, 'Restina Quispe', 'Restina', 'Quispe', ${C.rich}, 'Bolivia', 'CEO', 0),
    (${P.c}, 'Restor Mamani', 'Restor', 'Mamani', ${C.twin}, 'Bolivia', 'CTO', 0),
    (${P.d}, 'Restor Mamani', 'Restor', 'Mamani', ${C.twin}, 'Bolivia', 'CTO', 0)`;
  await s`INSERT INTO person_emails (person_id, email, type, status, source) VALUES (${P.a}, 'restina@restestpagos.com', 'work', 'verified', 'test'), (${P.b}, 'Restina@restestpagos.com', 'work', 'verified', 'test')`;
});

afterAll(async () => {
  if (dbUp) await cleanup();
  await getSql().end({ timeout: 1 });
});

describe("resolve endpoint uses canonical keys", () => {
  it("finds companies by any spelling of the domain or an alias, and people by any LinkedIn URL form", async () => {
    if (!dbUp) return;
    await getSql()`UPDATE people SET linkedin_url = 'https://www.linkedin.com/in/restor-mamani/' WHERE id = ${P.c}`;
    const [c1, c2] = await repo.resolveCompanies([{ domain: "HTTPS://WWW.RestTwin.io:443/about?x=1".replace("RestTwin", "restwin") }, { domain: "restestpagos.com.bo" }]);
    expect(c1?.company_id).toBe(C.twin);
    expect([C.rich, C.dup]).toContain(c2?.company_id);
    const [p] = await repo.resolvePeople([{ linkedin_url: "https://es.linkedin.com/in/restor-mamani?trk=1" }]);
    expect(p?.person_id).toBe(P.c);
  });
});

describe("entity resolution job", () => {
  it("dry run scores without writing", async () => {
    if (!dbUp) return;
    const sum = await repo.runResolution("company", { dryRun: true, onlyIds: Object.values(C) });
    expect(sum).toMatchObject({ autoMerged: 1, queued: 1 });
    const [{ n }] = (await getSql()`SELECT count(*)::int AS n FROM entity_match_candidates WHERE left_id = ANY(${ALL})`) as unknown as { n: number }[];
    expect(n).toBe(0);
  });

  it("auto-merges a shared domain into the richer record and queues the name twins", async () => {
    if (!dbUp) return;
    const sum = await repo.runResolution("company", { onlyIds: Object.values(C) });
    expect(sum).toMatchObject({ autoMerged: 1, queued: 1 });
    const s = getSql();
    const [dup] = (await s`SELECT deleted_at FROM companies WHERE id = ${C.dup}`) as unknown as { deleted_at: Date | null }[];
    expect(dup?.deleted_at).not.toBeNull();
    const [round] = (await s`SELECT company_id FROM funding_rounds WHERE id = 'trx_restest0000000000000001'`) as unknown as { company_id: string }[];
    expect(round?.company_id).toBe(C.rich);
    const [audit] = (await s`SELECT actor, actor_type FROM audit_log WHERE action = 'entity.merge' AND target = ${C.rich} ORDER BY seq DESC LIMIT 1`) as unknown as { actor: string; actor_type: string }[];
    expect(audit).toMatchObject({ actor: "system:resolution", actor_type: "system" });

    const queue = (await repo.listMatchCandidates(OPS, 200)).filter((m) => [m.left_id, m.right_id].includes(C.twin));
    expect(queue).toHaveLength(1);
    expect(queue[0]?.reason).toContain("name exact");
  });

  it("re-running is idempotent", async () => {
    if (!dbUp) return;
    const sum = await repo.runResolution("company", { onlyIds: Object.values(C) });
    expect(sum.autoMerged).toBe(0);
    const [{ n }] = (await getSql()`SELECT count(*)::int AS n FROM entity_match_candidates WHERE kind = 'company' AND left_id = ANY(${ALL})`) as unknown as { n: number }[];
    expect(n).toBe(2);
  });

  it("a rejected pair never comes back; non-admins are refused", async () => {
    if (!dbUp) return;
    const [m] = (await repo.listMatchCandidates(OPS, 200)).filter((x) => x.left_id === C.twin || x.right_id === C.twin);
    await expect(repo.decideMatchCandidate({ email: "x@founders.test", userId: "u" }, m!.id, { merge: false })).rejects.toBeInstanceOf(repo.ForbiddenError);
    await repo.decideMatchCandidate(OPS, m!.id, { merge: false });
    await repo.runResolution("company", { onlyIds: Object.values(C) });
    expect((await repo.listMatchCandidates(OPS, 200)).some((x) => x.left_id === C.twin || x.right_id === C.twin)).toBe(false);
  });

  it("people: shared e-mail auto-merges; same name at the same company is queued and can be merged by an admin", async () => {
    if (!dbUp) return;
    const sum = await repo.runResolution("person", { onlyIds: Object.values(P) });
    expect(sum).toMatchObject({ autoMerged: 1, queued: 1 });
    const [b] = (await getSql()`SELECT deleted_at FROM people WHERE id = ${P.b}`) as unknown as { deleted_at: Date | null }[];
    expect(b?.deleted_at).not.toBeNull();
    const [m] = (await repo.listMatchCandidates(OPS, 200)).filter((x) => x.left_id === P.c);
    await expect(repo.decideMatchCandidate(OPS, m!.id, { merge: true, keepId: C.rich })).rejects.toThrow(/Survivor/);
    const r = await repo.decideMatchCandidate(OPS, m!.id, { merge: true, keepId: P.c });
    expect(r.merged).toBe(true);
    const [row] = (await getSql()`SELECT status, decided_by FROM entity_match_candidates WHERE id = ${m!.id}`) as unknown as { status: string; decided_by: string }[];
    expect(row).toMatchObject({ status: "merged", decided_by: OPS.email });
  });
});
