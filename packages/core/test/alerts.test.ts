/**
 * Real-time alerts (plan 7.5/7.11): matching, delivery, tenancy, Slack validation, digest timing.
 * DB parts run against the seeded database and are skipped without one.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const A: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
const B: repo.OrgContext = { orgId: "org_demo000000000000000000002", userId: "usr_demo000000000000000000002", role: "owner" };
const SECRET_LIST = "lst_other_org_secret_0000001";
let dbUp = false;
let companyId = "";
const created: string[] = [];

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-for-hkdf-derivation-only";
  try {
    const [c] = await getSql()<{ id: string }[]>`SELECT id FROM companies ORDER BY rank LIMIT 1`;
    const [l] = await getSql()`SELECT 1 FROM lists WHERE id = ${SECRET_LIST}`;
    dbUp = Boolean(c && l);
    companyId = c?.id ?? "";
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  if (dbUp) {
    const sql = getSql();
    await sql`DELETE FROM alert_deliveries WHERE search_id = ANY(${created})`;
    await sql`DELETE FROM notifications WHERE payload->>'searchId' = ANY(${created})`;
    await sql`DELETE FROM search_result_snapshots WHERE search_id = ANY(${created})`;
    await sql`DELETE FROM saved_searches WHERE id = ANY(${created})`;
    await sql`DELETE FROM org_integrations WHERE org_id = ${B.orgId}`;
    await sql`DELETE FROM list_items WHERE list_id = ${SECRET_LIST}`;
  }
  await getSql().end({ timeout: 1 });
});

describe("Slack integration", () => {
  it("only accepts Slack incoming-webhook URLs", async () => {
    if (!dbUp) return;
    await expect(repo.setSlackWebhook(B, "https://evil.example.com/services/x")).rejects.toThrow("Host not allowed");
    await expect(repo.setSlackWebhook(B, "http://hooks.slack.com/services/x")).rejects.toThrow("Only https");
    await expect(repo.setSlackWebhook(B, "https://hooks.slack.com/api/other")).rejects.toThrow("incoming webhook");
    await expect(repo.setSlackWebhook({ ...B, role: "member" }, "https://hooks.slack.com/services/T0/B0/x")).rejects.toBeInstanceOf(repo.ForbiddenError);
  });
  it("stores the webhook encrypted and shows it masked", async () => {
    if (!dbUp) return;
    await repo.setSlackWebhook(B, "https://hooks.slack.com/services/T000/B000/secret1234");
    const [row] = await getSql()<{ secret: string }[]>`SELECT secret FROM org_integrations WHERE org_id = ${B.orgId}`;
    expect(row?.secret).not.toContain("hooks.slack.com");
    const list = await repo.getIntegrations(B);
    expect(list[0]?.target).toBe("https://hooks.slack.com/…1234");
    expect(await repo.getIntegrations(A)).toEqual([]);
  });
});

describe("real-time alerts", () => {
  it("matches outbox events per org (list filters never cross orgs) and delivers to Slack", async () => {
    if (!dbUp) return;
    await repo.addToList(B, SECRET_LIST, [companyId]);
    const filter = { kind: "group" as const, op: "AND" as const, children: [{ kind: "condition" as const, field: "list", operator: "in_list" as const, value: SECRET_LIST }] };
    const sA = await repo.createSavedSearch(A, { name: "test-A", product: "companies", filter, alertCadence: "REALTIME" });
    const sB = await repo.createSavedSearch(B, { name: "test-B", product: "companies", filter, alertCadence: "REALTIME" });
    created.push(sA.id, sB.id);
    await repo.updateSavedSearch(B, sB.id, { channels: ["in_app", "slack"] });
    // createSavedSearch snapshots current results; clear B's so the event counts as new.
    await getSql()`DELETE FROM search_result_snapshots WHERE search_id = ${sB.id}`;
    await getSql()`INSERT INTO outbox_events (product, entity_id, kind) VALUES ('companies', ${companyId}, 'UPDATED')`;

    const posts: { url: string; body: string }[] = [];
    const totals = await repo.processRealtimeAlerts({ post: async (url, body) => (posts.push({ url, body }), { status: 200 }) });
    expect(totals.new_results).toBeGreaterThanOrEqual(1);

    const snapA = await getSql()`SELECT 1 FROM search_result_snapshots WHERE search_id = ${sA.id}`;
    const snapB = await getSql()`SELECT entity_id FROM search_result_snapshots WHERE search_id = ${sB.id}`;
    expect(snapA.length).toBe(0); // org A cannot match org B's list
    expect(snapB.map((r) => r.entity_id)).toEqual([companyId]);

    const slackPosts = posts.filter((p) => p.body.includes("test-B"));
    expect(slackPosts).toHaveLength(1);
    expect(slackPosts[0]!.url).toBe("https://hooks.slack.com/services/T000/B000/secret1234");
    expect(JSON.parse(slackPosts[0]!.body).blocks.length).toBeGreaterThan(1);
    const deliveries = await repo.getAlertDeliveries(B, 10);
    expect(deliveries.filter((d) => d.search_id === sB.id).map((d) => d.channel).sort()).toEqual(["in_app", "slack"]);

    // Idempotent: processed events are not delivered again.
    const again = await repo.processRealtimeAlerts({ post: async () => ({ status: 200 }) });
    expect(again.events).toBe(0);
  });
});

describe("digest timing", () => {
  it("computes local hour and weekday per timezone", () => {
    const t = repo.localTime(new Date("2026-11-30T11:30:00Z"), "America/La_Paz");
    expect(t).toEqual({ hour: 7, weekday: "Mon", date: "2026-11-30" });
    expect(repo.localTime(new Date("2026-11-30T11:30:00Z"), "Europe/Madrid").hour).toBe(12);
  });
  it("Slack message escapes user text", () => {
    const m = repo.slackMessage("<b>x</b>", "companies", 2, [{ title: "A & B", sub: "" }], "https://app/searches/1");
    expect(JSON.stringify(m)).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(JSON.stringify(m)).toContain("A &amp; B");
  });
});
