/**
 * Cross-tenant tests (plan 8 tenancy note / 14.4): every org-scoped repo function must refuse to
 * read or write another org's objects. Runs against the seeded DB (skipped when no DB).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const A: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
const B: repo.OrgContext = { orgId: "org_demo000000000000000000002", userId: "usr_demo000000000000000000002", role: "owner" };
const SECRET = "lst_other_org_secret_0000001";
let dbUp = false;

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM lists WHERE id = ${SECRET}`.then((r) => (dbUp = r.length === 1));
  } catch {
    dbUp = false;
  }
});
afterAll(async () => {
  await getSql().end({ timeout: 1 });
});

describe("tenancy", () => {
  it("cannot read another org's list", async () => {
    if (!dbUp) return;
    await expect(repo.getList(A, SECRET)).rejects.toBeInstanceOf(repo.NotFoundError);
    await expect(repo.getListItems(A, SECRET)).rejects.toBeInstanceOf(repo.NotFoundError);
    expect((await repo.getLists(A)).some((l) => l.id === SECRET)).toBe(false);
  });
  it("cannot write to another org's list", async () => {
    if (!dbUp) return;
    await expect(repo.addToList(A, SECRET, ["x"])).rejects.toBeInstanceOf(repo.NotFoundError);
    await expect(repo.removeFromList(A, SECRET, ["x"])).rejects.toBeInstanceOf(repo.NotFoundError);
    await expect(repo.updateList(A, SECRET, { name: "pwned" })).rejects.toBeInstanceOf(repo.NotFoundError);
    await expect(repo.deleteList(A, SECRET)).rejects.toBeInstanceOf(repo.NotFoundError);
  });
  it("cannot see another org's saved searches", async () => {
    if (!dbUp) return;
    const mine = await repo.getSavedSearches(A);
    const theirs = await repo.getSavedSearches(B);
    expect(theirs.some((s) => mine.some((m) => m.id === s.id))).toBe(false);
    if (mine[0]) await expect(repo.getSavedSearch(B, mine[0].id)).rejects.toBeInstanceOf(repo.NotFoundError);
  });
  it("list filters never leak across orgs", async () => {
    if (!dbUp) return;
    const res = await repo.searchEntities("companies", { filter: { kind: "group", op: "AND", children: [{ kind: "condition", field: "list", operator: "in_list", value: SECRET }] }, orgId: A.orgId, limit: 5 });
    expect(res.total).toBe(0);
  });
  it("viewers cannot write", async () => {
    if (!dbUp) return;
    await expect(repo.createList({ ...A, role: "viewer" }, { name: "x", entityType: "COMPANY" })).rejects.toBeInstanceOf(repo.ForbiddenError);
  });
});
