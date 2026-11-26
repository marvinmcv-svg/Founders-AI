/**
 * Customer webhooks (plan 11 #71–74): signing, delivery, retries/backoff, 24 h auto-disable,
 * tenancy, and the outbox producers. DB parts run against the seeded database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const A: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
const B: repo.OrgContext = { orgId: "org_demo000000000000000000002", userId: "usr_demo000000000000000000002", role: "owner" };
const URL_B = "https://hooks.example.com/test-b";
let dbUp = false;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-for-hkdf-derivation-only";
  try {
    const [r] = await getSql()`SELECT count(*)::int AS n FROM companies`;
    dbUp = Number(r?.n) > 0;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  if (dbUp) {
    const sql = getSql();
    await sql`DELETE FROM webhook_deliveries WHERE org_id = ${B.orgId}`;
    await sql`DELETE FROM webhooks WHERE org_id = ${B.orgId}`;
  }
  await getSql().end({ timeout: 1 });
});

describe("signatures", () => {
  it("signs t.body with HMAC-SHA256 and verifies; tampering or staleness fails", () => {
    const body = JSON.stringify({ a: 1 });
    const now = 1_800_000_000;
    const h = repo.signWebhook("whsec_x", body, now);
    expect(h).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(repo.verifyWebhookSignature("whsec_x", body, h, 300, now + 10)).toBe(true);
    expect(repo.verifyWebhookSignature("whsec_x", body + " ", h, 300, now)).toBe(false);
    expect(repo.verifyWebhookSignature("whsec_y", body, h, 300, now)).toBe(false);
    expect(repo.verifyWebhookSignature("whsec_x", body, h, 300, now + 301)).toBe(false);
  });

  it("backs off six times", () => {
    expect(repo.WEBHOOK_BACKOFF_MIN).toHaveLength(6);
    expect([...repo.WEBHOOK_BACKOFF_MIN]).toEqual([...repo.WEBHOOK_BACKOFF_MIN].sort((a, b) => a - b));
  });
});

describe("delivery", () => {
  it("rejects http and private targets at creation", async () => {
    if (!dbUp) return;
    await expect(repo.createWebhook(B, { url: "http://hooks.example.com/x", events: ["signal.talent"] })).rejects.toThrow();
    await expect(repo.createWebhook(B, { url: "https://169.254.169.254/latest", events: ["signal.talent"] })).rejects.toThrow();
    await expect(repo.createWebhook({ ...B, role: "member" }, { url: URL_B, events: ["signal.talent"] })).rejects.toBeInstanceOf(repo.ForbiddenError);
  });

  it("delivers a signed event, then retries failures and disables after 24 h", async () => {
    if (!dbUp) return;
    const hook = await repo.createWebhook(B, { url: URL_B, events: ["signal.talent", "list.news"] });
    // Tenancy: another org cannot see or delete it.
    expect((await repo.listWebhooks(A)).some((w) => w.id === hook.id)).toBe(false);
    await expect(repo.deleteWebhook(A, hook.id)).rejects.toBeInstanceOf(repo.NotFoundError);

    expect(await repo.enqueueWebhookEvent(B.orgId, "search.new_results", { x: 1 })).toBe(0); // not subscribed
    expect(await repo.enqueueWebhookEvent(B.orgId, "signal.talent", { signal_ids: ["sig_1"] })).toBe(1);

    const seen: { url: string; body: string; headers: Record<string, string> }[] = [];
    const ok = await repo.deliverDueWebhooks({ post: async (url, body, headers) => (seen.push({ url, body, headers }), { status: 204 }) });
    expect(ok.delivered).toBeGreaterThanOrEqual(1);
    const mine = seen.find((s) => s.url === URL_B)!;
    expect(mine.headers["X-Webhook-Event"]).toBe("signal.talent");
    expect(repo.verifyWebhookSignature(hook.secret, mine.body, mine.headers["X-Signature"]!)).toBe(true);
    expect(JSON.parse(mine.body)).toMatchObject({ type: "signal.talent", data: { signal_ids: ["sig_1"] } });

    // Failure → PENDING with backoff; endpoint failing for > 24 h → DISABLED.
    await repo.enqueueWebhookEvent(B.orgId, "list.news", { list_id: "lst_x", signal_ids: [] });
    const t0 = new Date();
    const fail = async () => ({ status: 500 });
    const r1 = await repo.deliverDueWebhooks({ post: fail, now: t0 });
    expect(r1.retrying).toBeGreaterThanOrEqual(1);
    const [d] = await getSql()<{ attempts: number; status: string; next_attempt_at: Date }[]>`SELECT attempts, status, next_attempt_at FROM webhook_deliveries WHERE webhook_id = ${hook.id} AND event = 'list.news'`;
    expect(d).toMatchObject({ attempts: 1, status: "PENDING" });
    expect(new Date(d!.next_attempt_at).getTime() - t0.getTime()).toBeGreaterThanOrEqual(59_000);
    // Not due yet: nothing is retried immediately.
    expect((await repo.deliverDueWebhooks({ post: fail, now: t0 })).due).toBe(0);
    const later = new Date(t0.getTime() + repo.WEBHOOK_DISABLE_AFTER_MS + 60_000);
    const r2 = await repo.deliverDueWebhooks({ post: fail, now: later });
    expect(r2.disabled).toBe(1);
    const [w] = await repo.listWebhooks(B);
    expect(w).toMatchObject({ id: hook.id, status: "DISABLED" });
    expect(await repo.enqueueWebhookEvent(B.orgId, "signal.talent", {})).toBe(0); // disabled endpoints get nothing
    await repo.deleteWebhook(B, hook.id);
  });

  it("the outbox processor queues signal.talent for subscribed orgs", async () => {
    if (!dbUp) return;
    const hook = await repo.createWebhook(B, { url: URL_B, events: ["signal.talent"] });
    const sql = getSql();
    const [s] = await sql<{ id: string }[]>`SELECT id FROM talent_signals LIMIT 1`;
    await sql`INSERT INTO outbox_events (product, entity_id, kind) VALUES ('talent_signals', ${s!.id}, 'CREATED')`;
    const totals = await repo.processRealtimeAlerts();
    expect(totals.webhooks_queued).toBeGreaterThanOrEqual(1);
    const [d] = await sql<{ payload: { signal_ids: string[] } }[]>`SELECT payload FROM webhook_deliveries WHERE webhook_id = ${hook.id} AND event = 'signal.talent'`;
    expect(d!.payload.signal_ids).toContain(s!.id);
    await repo.deleteWebhook(B, hook.id);
  });
});
