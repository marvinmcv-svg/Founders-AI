/** Phase 10 (R3) flows: billing (simulator checkout), audit log, privacy, admin console, SSO/SCIM. */
import { createHmac } from "node:crypto";
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

/* ---------------- Identity: 2FA, SSO, SCIM ---------------- */

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret, for the 2FA flow. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/[\s=]/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("founders-demo");
  await page.getByRole("button", { name: "Log in" }).click();
}

test("2FA: set up with an authenticator, sign in with a code, turn off", async ({ page, context }) => {
  test.setTimeout(180_000);
  await loginAs(page, "teammate@foundersscz.com");
  await page.waitForURL(/\/companies/);
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Set up" }).click();
  await page.getByLabel("Your password").fill("founders-demo");
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = ((await page.getByTestId("totp-secret").textContent()) ?? "").replace(/\s/g, "");
  expect(secret.length).toBeGreaterThan(15);
  await page.screenshot({ path: `${SCREENS}/phase-10-2fa-setup.png` });
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify & turn on" }).click();
  await expect(page.getByText("on", { exact: true })).toBeVisible({ timeout: 30000 });

  await context.clearCookies();
  await loginAs(page, "teammate@foundersscz.com");
  await page.waitForURL(/\/login\/2fa/);
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Authentication code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/companies/);

  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Turn off" }).click();
  await page.getByLabel("Your password").fill("founders-demo");
  await page.getByRole("button", { name: "Turn off 2FA" }).click();
  await expect(page.getByText("off", { exact: true })).toBeVisible({ timeout: 30000 });
});

const SAML_CERT = "-----BEGIN CERTIFICATE-----\nMIIDHzCCAgegAwIBAgIUKgLFSgm8KK5m48qklrOhRGPP6V0wDQYJKoZIhvcNAQEL\nBQAwHzEdMBsGA1UEAwwUaWRwLmUyZS1zYW1sLmV4YW1wbGUwHhcNMjYxMTI2MjAx\nNzI4WhcNMzYxMTIzMjAxNzI4WjAfMR0wGwYDVQQDDBRpZHAuZTJlLXNhbWwuZXhh\nbXBsZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALW1g9qOufhKZ2N0\n3G2PXLEB4wPkehpgNFFD6WSxZOiAwGNGcpo0ZTvWt3DtLGQrPXs+7WXTm2ILtOoy\nf29iLl1wNdAP8SGe4nfjRDsRppgw8G+p/LYgIXvgzaxRXaki6qr8qcAByRis+0Q0\nkVujONBgr0NN9ZpF/e5ofOt5MTTUKXg4fKOVkGRx1uGdyuTiJYwipRBxpfthAsBQ\nrLDm4YvmCFlQKxEssG+Spj2tfmb2+swFGPQsxo4vOQpocfpGqh8OQRMmFkHhD8Wq\nutw8AV6VN+a+/TVBFi3rx/BZTW5xeRHYXol9OriXOlI85Cx7pRkLgjxVsID8m9Bo\nxQp7EcMCAwEAAaNTMFEwHQYDVR0OBBYEFOrfXbUnnfk2KMU8l2ZV1DGPcG7UMB8G\nA1UdIwQYMBaAFOrfXbUnnfk2KMU8l2ZV1DGPcG7UMA8GA1UdEwEB/wQFMAMBAf8w\nDQYJKoZIhvcNAQELBQADggEBAG0sT1CEteKUD9xPl3zX3O4zXxGZQiVLjNp6X3YV\np92lI1v+mLvO6d0qaPWiRjQCdH5B2hI5q8w+2sfo6RdDsB8YzVwvMYXAkh1mr2k+\nd34AN6HikQ6A6PXsF3bB+4VrJ3pLTGl0mSCraVkKeohaic+5NsNaP+OeMRM4mA+Z\nrdf2qW93F/yYFyGTJ1525l5D6Bj0KF2l5FqlJFxU7StmPQGcdKY1OGY+RdM1OfWy\noaPxVDHObIxf4upGFTV3ojKPc9RU7Na3znEsCtUyucas802xCTuuIJBe0CMShL0l\nlPPZYSLA7puPR1HJ8+++vMmxBcqbui0sCWOBSwsOSkYaeFo=\n-----END CERTIFICATE-----\n";

test("SSO + SCIM: SAML provider, admin domain verification, SSO redirect; SCIM token provisions over HTTP", async ({ page, context }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/settings/security");
  // Clean up a provider left by an earlier run.
  const stale = page.getByRole("button", { name: "Remove" });
  page.on("dialog", (d) => void d.accept());
  while (await stale.first().isVisible().catch(() => false)) {
    await stale.first().click();
    await page.waitForTimeout(1500);
  }
  await page.getByRole("button", { name: "Add identity provider" }).click();
  await page.getByRole("button", { name: "SAML" }).click();
  await page.getByLabel("E-mail domain").fill("e2e-saml.example");
  await page.getByLabel("Provider ID (slug)").fill("e2e-saml");
  await page.getByLabel("IdP entity ID").fill("https://idp.e2e-saml.example/entity");
  await page.getByLabel("IdP SSO URL").fill("https://idp.e2e-saml.example/sso");
  await page.getByLabel("Signing certificate (PEM)").fill(SAML_CERT);
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page.getByText("domain not verified")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "DNS record" }).click();
  await expect(page.getByText(/_founders-ai-e2e-saml\.e2e-saml\.example/)).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${SCREENS}/phase-10-security.png`, fullPage: true });

  // DNS can't be set in a test: support marks it verified from the admin console.
  await go(page, "/admin?tab=accounts&org=org_demo000000000000000000001");
  await page.getByRole("button", { name: "Mark domain verified" }).click();
  await expect(page.getByText("Domain marked verified.")).toBeVisible({ timeout: 30000 });

  // A user from that domain is sent to the IdP.
  await context.clearCookies();
  await page.route("https://idp.e2e-saml.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Test IdP</h1>" }));
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign in with SSO" }).click();
  await page.waitForURL(/\/login\/sso/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Work email").fill("someone@e2e-saml.example");
  await page.getByRole("button", { name: "Continue with SSO" }).click();
  await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/idp\.e2e-saml\.example\/sso\?SAMLRequest=/);
  await expect(page.getByText("Test IdP")).toBeVisible();
  await page.goto("/login/sso");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Work email").fill("someone@no-sso.example");
  await page.getByRole("button", { name: "Continue with SSO" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  // SCIM: a token from Settings provisions and deprovisions over HTTP.
  await login(page);
  await page.goto("/settings/security");
  await page.getByLabel("Token name").fill("e2e IdP");
  await page.getByRole("button", { name: "New SCIM token" }).click();
  const token = ((await page.getByTestId("scim-secret").textContent()) ?? "").trim();
  expect(token).toMatch(/^scim_/);
  const h = { authorization: `Bearer ${token}`, "content-type": "application/scim+json" };
  const email = `scim-e2e-${Date.now()}@e2e-saml.example`;
  const created = await page.request.post("/scim/v2/Users", { headers: h, data: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: email, name: { givenName: "Scim", familyName: "Person" }, active: true } });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  const found = await page.request.get(`/scim/v2/Users?filter=${encodeURIComponent(`userName eq "${email}"`)}`, { headers: h });
  expect(((await found.json()) as { totalResults: number }).totalResults).toBe(1);
  expect((await page.request.get("/scim/v2/Users", { headers: { authorization: "Bearer scim_nope" } })).status()).toBe(401);
  expect((await page.request.delete(`/scim/v2/Users/${id}`, { headers: h })).status()).toBe(204);

  // Leave the workspace as it was.
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Revoke" }).first().click();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("No identity provider connected.")).toBeVisible({ timeout: 30000 });
});
