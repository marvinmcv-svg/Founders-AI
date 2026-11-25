import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.click("form button");
  await page.waitForURL(/\/companies/);
  await page.locator("[data-hydrated=true]").waitFor({ timeout: 60000 });
}

test("build a nested filter, share the URL, save the search", async ({ page }) => {
  await login(page);
  const before = await page.locator("h1 + span").innerText();
  await page.getByRole("button", { name: /Add Filter/ }).click();
  await page.getByPlaceholder("Search fields…").fill("HQ Country");
  await page.getByRole("button", { name: "HQ Country" }).click();
  await page.getByLabel("Bolivia").check();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("HQ Country is any of Bolivia")).toBeVisible();
  // nested OR group through the advanced editor
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Nested group" }).click();
  await page.locator(".border-accent\\/25").getByRole("button", { name: "Condition" }).click();
  await page.getByRole("button", { name: "Growth Stage" }).click();
  await page.locator(".border-accent\\/25").getByLabel("Pre-seed / Seed").check();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/f=/);
  await expect(page.locator("h1 + span")).not.toHaveText(before, { timeout: 15000 });
  const shared = page.url();
  // shareable: reload restores filters
  await page.goto(shared);
  await expect(page.getByText("HQ Country is any of Bolivia")).toBeVisible();
  // save
  await page.getByRole("button", { name: "Save Search" }).click();
  const name = `E2E Bolivia seed ${Date.now()}`;
  await page.getByPlaceholder(/Name, e.g./).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/searches");
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("natural-language search produces editable filters", async ({ page }) => {
  await login(page);
  await page.getByLabel("Describe what you're looking for").fill("seed fintech in Bolivia");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("HQ Country is any of Bolivia")).toBeVisible({ timeout: 30000 });
});

test("add to list from the grid, then see it on the list page; export costs credits", async ({ page }) => {
  await login(page);
  const firstName = await page.locator("[role=row] a[href^='/companies/com_']").first().innerText();
  await page.getByLabel("Select row").first().check();
  await page.getByRole("button", { name: "Add to list" }).click();
  const list = `E2E list ${Date.now()}`;
  await page.getByPlaceholder("New list name").fill(list);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(`Created ${list}`)).toBeVisible({ timeout: 30000 });
  await page.goto("/lists");
  await page.getByRole("table").getByRole("link", { name: list }).click();
  await expect(page.getByRole("table")).toContainText(firstName);
  await page.goto("/companies");
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText(/Costs \d+ credit/)).toBeVisible();
});

test("profile tabs render data", async ({ page }) => {
  await login(page);
  const href = await page.locator("[role=row] a[href^='/companies/com_']").first().getAttribute("href");
  await page.goto(href!);
  for (const tab of ["Financials", "Team", "News", "Competitors", "Business"]) {
    await page.getByRole("link", { name: new RegExp(`^${tab}`) }).click();
    await expect(page.locator("main, body").getByRole("heading").first()).toBeVisible();
  }
});
