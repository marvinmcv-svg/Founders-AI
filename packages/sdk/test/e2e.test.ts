/** The SDK against the real API (in-process Hono app) and the seeded database. Skips without a DB. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@founders/db";
import { app } from "@founders/api";
import { FoundersAI, NotFoundError, type FetchLike } from "../src";

const DEMO_KEY = "fai_demo_local_only_9f3c2b7a1e5d4c8b"; // packages/seed/src/demo.ts
const inProcess: FetchLike = async (url, init) => app.request(url.replace("https://api.local", ""), init);
let fa: FoundersAI;
let dbUp = false;

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM api_keys WHERE prefix = ${DEMO_KEY.slice(0, 10)} LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  fa = new FoundersAI({ apiKey: DEMO_KEY, baseUrl: "https://api.local/api/v1", fetch: inProcess, sleep: async () => {} });
});
afterAll(async () => {
  await getSql().end({ timeout: 1 });
});

describe("SDK end to end", () => {
  it("reads a company, charges credits, and does not charge a miss", async () => {
    if (!dbUp) return;
    const page = await fa.transactions.fundingRounds({ limit: 3 });
    expect(page.items.length).toBe(3);
    const companyId = String((page.items[0] as { company_id: string }).company_id);
    const co = await fa.companies.get(companyId);
    expect(co.$meta.creditsCharged).toBe(1);
    expect(typeof co.$meta.creditsRemaining).toBe("number");
    const before = (await fa.account.credits()) as unknown as { balance: number };
    const miss = await fa.companies.get("com_doesnotexist000000000000").catch((e: unknown) => e);
    expect(miss).toBeInstanceOf(NotFoundError);
    const after = (await fa.account.credits()) as unknown as { balance: number };
    expect(after.balance).toBe(before.balance);
  });

  it("paginates a feed with a real cursor", async () => {
    if (!dbUp) return;
    const ids: string[] = [];
    for await (const r of fa.paginate((p) => fa.transactions.fundingRounds(p), { limit: 2, maxItems: 5 })) ids.push(String((r as { id: string }).id));
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("runs an AI search and resolves domains", async () => {
    if (!dbUp) return;
    const q = await fa.search.ai({ query: "seed fintech in Bolivia", limit: 5 });
    expect(q.query_id).toBeTruthy();
    const resolved = await fa.companies.resolve([{ domain: "https://www.does-not-exist.example/" }]);
    expect(resolved.$meta.status).toBe(200);
  });
});
