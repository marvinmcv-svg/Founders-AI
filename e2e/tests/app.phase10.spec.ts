/** Phase 10 (R3) flows: billing (simulator checkout), audit log, privacy, admin console, SSO/SCIM. */
import { expect, test, type Page } from "@playwright/test";

const SCREENS = "../docs/progress/screens";

async function login(page: Page) {
  await page.goto("/login");
  await page.click("form button");
  await page.waitForURL(/\/companies/);
  await page.locator("[data-hydrated=true]").waitFor({ timeout: 60000 });
}

test("billing: buy seats and a credit pack through the simulator; audit log shows both", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/settings/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  const balanceText = async () => Number(((await page.locator("p:has-text('Credit balance') + p").textContent()) ?? "0").replace(/[^\d-]/g, ""));
  const before = await balanceText();

  // Seats: first purchase goes through checkout; later changes update in place.
  const seats = page.getByLabel("Seats");
  const current = Number(await seats.inputValue());
  await seats.fill(String(current + 1));
  const buy = page.getByRole("button", { name: /Buy seats|Update seats/ });
  const firstPurchase = (await buy.textContent())?.includes("Buy");
  await buy.click();
  if (firstPurchase) {
    await page.waitForURL(/\/settings\/billing\/simulate/);
    await expect(page.getByText(/platform seats?, billed annually/)).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/phase-10-checkout-simulator.png` });
    await page.getByRole("button", { name: "Pay (simulated)" }).click();
    await page.waitForURL(/checkout=success/);
  } else {
    await expect(page.getByText("Seats updated.")).toBeVisible({ timeout: 30000 });
  }
  await expect(page.getByText(`/ ${current + 1}`)).toBeVisible({ timeout: 30000 });

  // Credit pack.
  await page.getByRole("button", { name: "+10,000 credits" }).click();
  await page.waitForURL(/\/settings\/billing\/simulate/);
  await expect(page.getByText("10,000 API credits")).toBeVisible();
  await page.getByRole("button", { name: "Pay (simulated)" }).click();
  await page.waitForURL(/checkout=success/);
  await expect.poll(balanceText, { timeout: 30000 }).toBeGreaterThanOrEqual(before + 10_000);
  await expect(page.getByText("Credit pack · 10,000").first()).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/phase-10-billing.png`, fullPage: true });

  await page.goto("/settings/audit?action=billing.");
  await expect(page.getByText(/Chain verified/)).toBeVisible();
  await expect(page.locator("td", { hasText: "billing.credits.purchased" }).first()).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/phase-10-audit-log.png` });
  const csv = await page.request.get("/api/audit/export?action=billing.");
  expect(csv.status()).toBe(200);
  expect((await csv.text()).split("\n")[0]).toBe("at,seq,actor,actor_name,actor_type,action,target,ip,metadata");
});

test("stripe webhook rejects unsigned and forged events", async ({ request }) => {
  const body = JSON.stringify({ id: "evt_forged", type: "checkout.session.completed", data: { object: { id: "cs_x", metadata: { org_id: "org_demo000000000000000000001", kind: "credit_pack", pack: "pack_250k" }, payment_status: "paid" } } });
  const unsigned = await request.post("/api/stripe/webhook", { data: body, headers: { "content-type": "application/json" } });
  expect(unsigned.status()).toBe(400);
  const forged = await request.post("/api/stripe/webhook", { data: body, headers: { "content-type": "application/json", "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"ab".repeat(32)}` } });
  expect(forged.status()).toBe(400);
});
