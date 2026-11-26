/** Phase 8 (R3) flows: CRM sandbox connect → match preview → pull → push from grid and profile. */
import { expect, test, type Page } from "@playwright/test";

const SCREENS = "../docs/progress/screens";
const enc = (g: unknown) => Buffer.from(JSON.stringify(g)).toString("base64url");

async function login(page: Page) {
  await page.goto("/login");
  await page.click("form button");
  await page.waitForURL(/\/companies/);
  await page.locator("[data-hydrated=true]").waitFor({ timeout: 60000 });
}

test("CRM: connect a sandbox, preview matches, pull, push from grid and profile", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/settings#crm");
  const crm = page.locator("#crm");
  const attio = crm.getByRole("button", { name: /^Attio/ });
  const expand = async () => {
    if ((await attio.getAttribute("aria-expanded")) !== "true") await attio.click();
  };
  await expand();
  // Leave a clean slate if a previous run left Attio connected.
  const disconnect = crm.getByRole("button", { name: "Disconnect" });
  if (await disconnect.isVisible().catch(() => false)) {
    await disconnect.click();
    await expect(page.getByRole("button", { name: "Connect sandbox" })).toBeVisible({ timeout: 30000 });
  }
  await page.getByRole("button", { name: "Connect sandbox" }).click();
  await expect(page.getByText("Sandbox connected")).toBeVisible({ timeout: 60000 });

  await page.getByRole("button", { name: "Preview matches" }).click();
  await expect(page.getByText(/companies matched & visible/)).toBeVisible({ timeout: 60000 });
  await expect(crm.getByText("12 unmatched", { exact: true })).toBeVisible();
  await crm.screenshot({ path: `${SCREENS}/phase-8-crm-preview.png` });

  await page.getByRole("button", { name: "Confirm & pull" }).click();
  await expect(page.getByText(/Pulled — CRM badges/)).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/matched of/).first()).toBeVisible();

  // Grid: CRM filter + badges, then push two rows that are not in the CRM yet.
  const notSynced = enc(({ kind: "group", op: "AND", children: [{ kind: "condition", field: "crm_status", operator: "any_of", value: ["NOT_SYNCED"] }] }));
  await page.goto(`/companies?f=${notSynced}`);
  await page.locator("[data-hydrated=true]").waitFor();
  await page.getByLabel("Select row").nth(0).check();
  await page.getByLabel("Select row").nth(1).check();
  await page.getByRole("button", { name: "Push to CRM" }).click();
  await expect(page.getByText(/2 created, 0 updated in attio/)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[aria-label^='In CRM (Attio)']").first()).toBeVisible();

  const inCrm = enc(({ kind: "group", op: "AND", children: [{ kind: "condition", field: "crm_status", operator: "any_of", value: ["IN_CRM", "NOT_ENRICHED"] }] }));
  await page.goto(`/companies?f=${inCrm}`);
  await page.locator("[data-hydrated=true]").waitFor();
  await expect(page.getByText("CRM", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/phase-8-crm-grid.png` });

  // Profile: badge + one-click push updates the existing CRM record.
  const href = await page.locator("a[href^='/companies/com_']").first().getAttribute("href");
  await page.goto(String(href));
  await expect(page.getByText(/^In CRM/).first()).toBeVisible();
  await page.getByRole("button", { name: "Push to Attio" }).click();
  await expect(page.getByText("Updated in Attio")).toBeVisible({ timeout: 30000 });

  // Activity log shows pull + push; then clean up.
  await page.goto("/settings#crm");
  await expect(crm.getByText("CRM activity log")).toBeVisible();
  await expect(page.getByText("pull", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("push", { exact: true }).first()).toBeVisible();
  await expand();
  await crm.screenshot({ path: `${SCREENS}/phase-8-crm-settings.png` });
  await crm.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Connect sandbox" })).toBeVisible({ timeout: 30000 });
});
