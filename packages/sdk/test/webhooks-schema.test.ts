/** Webhook verification matches the server signer; generated schema matches the live API document. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { signWebhook } from "../../core/src/repo/webhooks";
import { constructWebhookEvent, verifyWebhookSignature } from "../src";
import { renderSchema } from "../scripts/generate";

describe("webhooks", () => {
  const body = JSON.stringify({ id: "whd_1", type: "signal.talent", created_at: "2026-11-27T00:00:00Z", data: { signal_ids: ["sig_1"] } });
  const now = 1_800_000_000;
  const header = signWebhook("whsec_test", body, now);

  it("accepts the server's signature (string or bytes) and rejects tampering, wrong secret and stale times", async () => {
    expect(await verifyWebhookSignature("whsec_test", body, header, { now: now + 5 })).toBe(true);
    expect(await verifyWebhookSignature("whsec_test", new TextEncoder().encode(body), header, { now })).toBe(true);
    expect(await verifyWebhookSignature("whsec_test", body + " ", header, { now })).toBe(false);
    expect(await verifyWebhookSignature("whsec_other", body, header, { now })).toBe(false);
    expect(await verifyWebhookSignature("whsec_test", body, header, { now: now + 301 })).toBe(false);
    expect(await verifyWebhookSignature("whsec_test", body, null)).toBe(false);
    expect(await verifyWebhookSignature("whsec_test", body, "t=x,v1=y", { now })).toBe(false);
  });

  it("constructs the event only when the signature is valid", async () => {
    const e = await constructWebhookEvent<{ signal_ids: string[] }>("whsec_test", body, header, { now });
    expect(e.data.signal_ids).toEqual(["sig_1"]);
    await expect(constructWebhookEvent("whsec_bad", body, header, { now })).rejects.toThrow(/signature/);
  });
});

describe("generated types", () => {
  it("src/schema.ts is up to date with the API (run `pnpm --filter @founders/sdk generate`)", async () => {
    const current = readFileSync(path.join(__dirname, "../src/schema.ts"), "utf8");
    expect(current).toBe(await renderSchema());
  });
});
