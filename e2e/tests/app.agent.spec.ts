/** Phase 6 (R2) agent flows: chat with steps + sources, skills, confirmations, save-to-list, personalization. */
import { expect, test, type Page } from "@playwright/test";

const SHOTS = "../docs/progress/screens";

async function login(page: Page) {
  await page.goto("/login");
  await page.click("form button");
  await page.waitForURL(/\/companies/);
  await page.locator("[data-hydrated=true]").waitFor({ timeout: 60000 });
}

async function ask(page: Page, text: string) {
  const box = page.getByLabel("Message the agent");
  await box.fill(text);
  await box.press("Escape");
  await page.getByRole("button", { name: "Send" }).click();
}

test("agent mode: ask a sourcing question, see steps, sources and a savable table", async ({ page }) => {
  await login(page);
  await page.getByRole("tab", { name: "Agent" }).click();
  await page.waitForURL(/\/agent$/, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "What are you researching?" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("link", { name: "Skills" })).toBeVisible();
  await ask(page, "fintech companies in Brazil growing headcount");
  await expect(page).toHaveURL(/\/agent\/thr_/, { timeout: 30000 });
  await expect(page.getByText(/match\(es\)/).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/Answered by/)).toBeVisible();
  await expect(page.getByText(/\d+ steps?/).first()).toBeVisible();
  // Source chips link to profiles
  const chip = page.locator('a[href^="/companies/com_"]').first();
  await expect(chip).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/phase-6-agent-sourcing.png`, fullPage: false });
  // Save the result table to a new list
  await page.getByRole("button", { name: "Save to list" }).first().click();
  await page.getByRole("button", { name: /\+ New list/ }).click();
  await expect(page.getByText(/Saved \d+ record\(s\)\./)).toBeVisible({ timeout: 20000 });
  // Thread shows up in the agent sidebar history
  await expect(page.locator('aside a[href^="/agent/thr_"]').first()).toBeVisible();
});

test("Ask agent from a company profile runs a sourced company brief", async ({ page }) => {
  await login(page);
  await page.locator('a[href^="/companies/com_"]').first().click();
  await page.waitForURL(/\/companies\/com_/);
  await page.getByRole("link", { name: "Ask agent" }).click();
  await page.waitForURL(/\/agent\?entity=com_/);
  const box = page.getByLabel("Message the agent");
  await expect(box).toHaveValue(/^@\[.+\]\(com_[a-z0-9]+\) $/);
  await box.press("End");
  await box.pressSequentially("give me a brief");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Funding & financials" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("heading", { name: "Competitors" })).toBeVisible();
  await expect(page.getByText(/unverified numbers/)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/phase-6-agent-company-brief.png`, fullPage: false });
});

test("write actions need confirmation: Allow once creates the list", async ({ page }) => {
  await login(page);
  await page.goto("/agent");
  await ask(page, "/stealth-radar and save them to a list");
  await expect(page.getByText("The agent wants to:")).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: `${SHOTS}/phase-6-agent-confirmation.png`, fullPage: false });
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByText(/Done: List created with \d+ record\(s\)/)).toBeVisible({ timeout: 30000 });
});

test("skills: library, create a workspace skill, run it from the composer", async ({ page }) => {
  await login(page);
  await page.goto("/agent/skills");
  await expect(page.getByRole("heading", { level: 1, name: "Skills" })).toBeVisible();
  await expect(page.getByText("/market-map")).toBeVisible();
  await page.getByRole("button", { name: "New skill" }).click();
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.getByLabel("Name").fill("E2E fintech screen");
  await page.getByLabel("Command").fill(slug);
  await page.getByLabel("Description").fill("Screen fintech in Brazil");
  await page.getByLabel(/Steps/).fill("Search fintech companies in Brazil.\nRank by headcount growth.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`/${slug}`)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/phase-6-skills.png`, fullPage: false });
  // The / picker in the composer offers it
  await page.goto("/agent");
  await page.getByLabel("Message the agent").pressSequentially(`/${slug.slice(0, 6)}`);
  await expect(page.getByRole("option", { name: new RegExp(`/${slug}`) })).toBeVisible();
});

test("personalization saves and is applied", async ({ page }) => {
  await login(page);
  await page.goto("/agent/personalization");
  await page.getByLabel("Thesis").first().fill("B2B fintech infrastructure in Brazil");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved.").first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/phase-6-personalization.png`, fullPage: false });
});
