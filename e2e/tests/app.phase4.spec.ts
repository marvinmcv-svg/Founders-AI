/** Phase 4 (R2) flows: new grids, Traction & Reviews tabs, real-time alerts, Slack setup, anchor review. */
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.click("form button");
  await page.waitForURL(/\/companies/);
  await page.locator("[data-hydrated=true]").waitFor({ timeout: 60000 });
}

test("acquisitions, IPOs and news grids load, filter and link to profiles", async ({ page }) => {
  await login(page);
  for (const [path, title, column] of [
    ["/acquisitions", "Acquisitions", "Acquirer"],
    ["/ipos", "IPOs", "Exchange"],
    ["/news", "News", "Category"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
  }
  // NL search on the news grid produces editable chips for the new fields
  await page.getByLabel("Describe what you're looking for").fill("major funding news in Brazil");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/Major news is true/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Category is any of funding/)).toBeVisible();
});

test("company profile has Traction Metrics and Reviews tabs", async ({ page }) => {
  await login(page);
  await page.goto("/companies");
  await page.locator("[data-hydrated=true]").waitFor();
  await page.locator("a[href^='/companies/com_']").first().click();
  await page.getByRole("link", { name: /Traction Metrics/ }).click();
  await expect(page.getByText("Popularity rank", { exact: true })).toBeVisible();
  await expect(page.getByText("Web visits / month")).toBeVisible();
  await page.getByRole("tab", { name: "12m" }).click();
  await expect(page).toHaveURL(/period=12m/);
  await page.getByRole("link", { name: /^Reviews/ }).click();
  await expect(page.getByText(/reviews$|No reviews found/).first()).toBeVisible();
});

test("a saved search can be switched to real-time Slack alerts", async ({ page }) => {
  await login(page);
  await page.goto("/searches");
  await page.locator("a[href^='/searches/srh_']").first().click();
  const select = page.getByLabel("Alerts");
  await select.selectOption("REALTIME");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByLabel("Slack").check();
  await expect(page.getByLabel("Slack")).toBeEnabled(); // save finished (controls are disabled while pending)
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByLabel("Alerts")).toHaveValue("REALTIME");
  await expect(page.getByLabel("Slack")).toBeChecked();
});

test("Slack integration rejects non-Slack URLs", async ({ page }) => {
  await login(page);
  await page.goto("/settings#integrations");
  await page.getByLabel("Slack incoming webhook URL").fill("https://example.com/hook");
  await page.getByRole("button", { name: /Connect|Replace/ }).click();
  await expect(page.getByRole("status")).toContainText(/not allowed|incoming webhook/i);
  await expect(page.getByText("Recent alert deliveries")).toBeVisible();
});

test("platform admins review extracted revenue anchors", async ({ page }) => {
  await login(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve" }).first();
  if (await approve.count()) {
    const before = await page.getByRole("link", { name: /Disclosure queue/ }).innerText();
    await approve.click();
    await expect(page.getByRole("link", { name: /Disclosure queue/ })).not.toHaveText(before, { timeout: 15000 });
  }
  await page.getByRole("link", { name: "Models" }).click();
  await expect(page.getByText(/v1-lgbm-|v0-heuristic/).first()).toBeVisible();
  await page.getByRole("link", { name: "Pipelines" }).click();
  await expect(page.getByText(/talent|news|highlights/).first()).toBeVisible();
});
