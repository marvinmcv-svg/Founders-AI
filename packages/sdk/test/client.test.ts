/** TS SDK transport: retries, idempotency, typed errors, metadata, params, pagination (plan 11). */
import { describe, expect, it } from "vitest";
import { AuthenticationError, FoundersAI, NotAvailableYetError, NotFoundError, RateLimitError, type FetchLike } from "../src";

type Call = { url: string; init: RequestInit };
function mock(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    if (r instanceof Error) throw r;
    return r;
  };
  const sleeps: number[] = [];
  const fa = new FoundersAI({ apiKey: "fai_test", baseUrl: "https://api.test/api/v1/", fetch, sleep: async (ms) => void sleeps.push(ms) });
  return { fa, calls, sleeps };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("transport", () => {
  it("requires a key", () => {
    const prev = process.env.FOUNDERS_AI_API_KEY;
    delete process.env.FOUNDERS_AI_API_KEY;
    expect(() => new FoundersAI()).toThrow(/FOUNDERS_AI_API_KEY/);
    if (prev) process.env.FOUNDERS_AI_API_KEY = prev;
  });

  it("sends the key, encodes path and query params, and exposes non-enumerable $meta", async () => {
    const { fa, calls } = mock([json(200, { id: "com_1" }, { "X-Credits-Charged": "1", "X-Credits-Remaining": "99", "X-Request-Id": "req_1" })]);
    const r = await fa.get("/companies/{companyId}", { path: { companyId: "com/1 x" } });
    expect(calls[0]!.url).toBe("https://api.test/api/v1/companies/com%2F1%20x");
    expect((calls[0]!.init.headers as Record<string, string>)["X-API-Key"]).toBe("fai_test");
    expect(r.$meta).toEqual({ status: 200, creditsCharged: 1, creditsRemaining: 99, requestId: "req_1", replayed: false });
    expect(JSON.stringify(r)).toBe('{"id":"com_1"}');

    const m2 = mock([json(200, { items: [] })]);
    await m2.fa.transactions.fundingRounds({ type: "Seed,Series A", announced_date_after: "2026-01-01", limit: 50 });
    expect(m2.calls[0]!.url).toBe("https://api.test/api/v1/funding-rounds?type=Seed%2CSeries+A&announced_date_after=2026-01-01&limit=50");
  });

  it("refuses a missing path parameter before calling", async () => {
    const { fa, calls } = mock([]);
    await expect(fa.request("GET", "/companies/{companyId}", {})).rejects.toThrow(/companyId/);
    expect(calls).toHaveLength(0);
  });

  it("retries 429 after Retry-After and 5xx with backoff, reusing one Idempotency-Key", async () => {
    const { fa, calls, sleeps } = mock([
      json(429, { title: "Too Many Requests" }, { "Retry-After": "2" }),
      json(503, { title: "Unavailable" }),
      new Error("ECONNRESET"),
      json(200, { items: [{ company_id: "com_1" }] }, { "Idempotent-Replayed": "true" }),
    ]);
    const r = await fa.companies.resolve([{ domain: "acme.com" }]);
    expect(calls).toHaveLength(4);
    expect(sleeps[0]).toBe(2000);
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^ts-/);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ items: [{ domain: "acme.com" }] });
    expect(r.$meta.replayed).toBe(true);
  });

  it("gives up after maxRetries with a typed error", async () => {
    const { fa, calls } = mock([json(429, {}), json(429, {}), json(429, {}), json(429, { title: "Too Many Requests" }, { "X-Request-Id": "req_9" })]);
    const err = await fa.account.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).requestId).toBe("req_9");
    expect(calls).toHaveLength(4);
  });

  it("never retries 4xx or 501 and maps statuses to error classes", async () => {
    const a = mock([json(401, { title: "Unauthorized", detail: "Invalid key" })]);
    await expect(a.fa.account.credits()).rejects.toBeInstanceOf(AuthenticationError);
    const b = mock([json(404, { title: "Not Found" })]);
    await expect(b.fa.companies.get("com_missing")).rejects.toBeInstanceOf(NotFoundError);
    const c = mock([json(501, { title: "Not Implemented", available_in: "R3" })]);
    const e = await c.fa.signals.investorInterest().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NotAvailableYetError);
    expect((e as NotAvailableYetError).problem.available_in).toBe("R3");
    expect(a.calls.length + b.calls.length + c.calls.length).toBe(3);
  });

  it("paginates through next_cursor and stops at maxItems", async () => {
    const { fa, calls } = mock([json(200, { items: [1, 2], next_cursor: "c2" }), json(200, { items: [3, 4], next_cursor: "c3" }), json(200, { items: [5], next_cursor: null })]);
    const all: unknown[] = [];
    for await (const x of fa.paginate((p) => fa.signals.talent({ ...p, min_score: 8 }), { limit: 2 })) all.push(x);
    expect(all).toEqual([1, 2, 3, 4, 5]);
    expect(calls.map((c) => new URL(c.url).searchParams.get("cursor"))).toEqual([null, "c2", "c3"]);
    expect(new URL(calls[0]!.url).searchParams.get("min_score")).toBe("8");

    const m = mock([json(200, { items: [1, 2], next_cursor: "c2" })]);
    const some: unknown[] = [];
    for await (const x of m.fa.paginate((p) => m.fa.signals.news(p), { maxItems: 1 })) some.push(x);
    expect(some).toEqual([1]);
  });
});
