/** Phase 10 (R3) flows: billing (simulator checkout), audit log, privacy, admin console, SSO/SCIM. */
import { expect, test, type Page } from "@playwright/test";

const SCREENS = "../docs/progress/screens";

/** Navigate and wait for the app shell to hydrate (forms submit natively before that). */
async function go(page: Page, url: string) {
  await page.goto(url);
  await page.locator("[data-hydrated=true]").first().waitFor({ state: "attached", timeout: 60000 });
}

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

const WWW = process.env.WWW_URL ?? "http://localhost:3000";

test("privacy: public request → admin verifies, links the profile, completes; export downloads", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  // Pick a real profile to ask about.
  await page.goto("/people");
  const first = page.locator("a[href^='/people/per_']").first();
  await first.waitFor();
  const name = ((await first.textContent()) ?? "").trim();
  expect(name.length).toBeGreaterThan(2);

  await page.goto(`${WWW}/privacy-rights?type=ACCESS`);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.org`);
  await page.getByLabel(/LinkedIn profile URL/).fill("");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText(/Request received/)).toBeVisible();
  await page.goto(`${WWW}/api/dsar/verify?id=dsr_nope&token=xxxxxxxxxxxxxxxx`);
  await expect(page.getByText(/not valid/)).toBeVisible();

  await go(page, "/admin?tab=dsar");
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByText("1. Identity")).toBeVisible();
  await page.locator("[data-hydrated=true]").first().waitFor({ state: "attached" });
  await page.getByLabel("How identity was verified").fill("Replied from the address on file (e2e)");
  await page.getByRole("button", { name: "Mark verified" }).click();
  await expect(page.getByText(/^Verified /)).toBeVisible({ timeout: 30000 });
  await page.locator("label", { hasText: name }).first().locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Link 1 profile/ }).click();
  await expect(page.getByText("1 profile(s) linked.")).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${SCREENS}/phase-10-admin-dsar.png`, fullPage: true });
  await page.getByRole("button", { name: "Complete access" }).click();
  await expect(page.getByText(/^Closed /)).toBeVisible({ timeout: 30000 });
  const dl = page.getByRole("link", { name: "Download the export (JSON)" });
  const res = await page.request.get((await dl.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { profiles: { profile: { full_name: string } }[] };
  expect(body.profiles[0]!.profile.full_name).toBe(name);

  // Self-service export of the signed-in user's own data.
  const mine = await page.request.get("/api/privacy/export");
  expect(mine.status()).toBe(200);
  expect(((await mine.json()) as { user: { email: string } }).user.email).toBe("demo@foundersscz.com");
  await page.goto("/settings#privacy");
  await expect(page.getByRole("link", { name: "Download JSON" })).toBeVisible();
});

test("admin console: accounts & credits, key queue, entities, taxonomy, signal QA", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await go(page, "/admin?tab=accounts");
  await page.getByRole("link", { name: "Founders SCZ (Demo)" }).first().click();
  await expect(page.getByText("Contract terms")).toBeVisible();
  await page.locator("[data-hydrated=true]").first().waitFor({ state: "attached" });
  await page.getByLabel("Credits (+/−)").fill("5");
  await page.getByLabel("Note (contract, goodwill…)").fill("e2e goodwill");
  await page.getByRole("button", { name: "Adjust" }).click();
  await expect(page.getByText("Balance updated.")).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${SCREENS}/phase-10-admin-account.png`, fullPage: true });

  await go(page, "/admin?tab=keys");
  await expect(page.getByText(/No keys waiting|Approve/).first()).toBeVisible();

  await go(page, "/admin?tab=entities");
  await expect(page.getByText("Merge duplicates")).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/phase-10-admin-entities.png` });

  await go(page, "/admin?tab=taxonomy&kind=SECTOR");
  await expect(page.getByText(/companies$/).first()).toBeVisible();

  await go(page, "/admin?tab=qa&kind=NEWS");
  await page.getByRole("button", { name: "Correct" }).first().click();
  await expect(page.getByText(/news · /).first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${SCREENS}/phase-10-admin-qa.png` });
});
