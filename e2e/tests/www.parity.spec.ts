import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Structural parity (plan 15): every page's section IDs from recon/sections.md exist, in order. */
const spec = readFileSync(new URL("../../recon/sections.md", import.meta.url), "utf8");
const pages = spec
  .split(/\n## /)
  .slice(1)
  .map((block) => ({ path: block.match(/^`([^`]+)`/)![1]!, ids: [...block.matchAll(/^- `([a-z0-9-]+\.[a-z0-9-]+)`/gm)].map((x) => x[1]!) }));

for (const p of pages) {
  test(`sections in order on ${p.path}`, async ({ page }) => {
    await page.goto(p.path);
    const found = await page.$$eval("[data-section]", (els) => els.map((e) => e.getAttribute("data-section")));
    expect(found).toEqual(p.ids);
    expect(await page.locator("text=TODO-COPY").count()).toBe(0);
  });
}

test("demo form rejects free mail and accepts work email", async ({ page }) => {
  await page.goto("/contact");
  await page.fill("#firstName", "Ana");
  await page.fill("#lastName", "Paz");
  await page.fill("#email", "ana@gmail.com");
  await page.selectOption("#firmType", "VC");
  await page.selectOption("#aum", "<$50M");
  await page.click("form button[type=submit]");
  await expect(page.getByText("Please use your work email.")).toBeVisible();
  await page.fill("#email", "ana@andes-ventures.example");
  await page.click("form button[type=submit]");
  await expect(page.getByText(/we'll be in touch/i)).toBeVisible();
});

test("R2 links land on coming-soon, not 404", async ({ page }) => {
  const r = await page.goto("/soon/integrations");
  expect(r?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
});

test("home links into the Founders app and ecosystem", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator('[data-section="home.hero"]');
  await expect(hero.getByRole("link", { name: /Open Founders AI/ })).toHaveAttribute("href", /\/signup$/);
  const eco = page.locator('[data-section="home.ecosystem"]');
  await expect(eco.locator('a[href="https://foundersscz.com/aplicar"]')).toHaveCount(1);
  await expect(eco.locator('a[href="https://academy.foundersscz.com"]')).toHaveCount(1);
  await expect(eco.locator('a[href$="/signup"]')).toHaveCount(1);
  await expect(page.locator('[data-section="home.social"] a[href^="https://www.instagram.com/"]')).toHaveCount(7);
  await expect(page.getByRole("banner").getByRole("link", { name: "Open the app" }).first()).toHaveAttribute("href", /\/signup$/);
});

test("retired coming-soon URLs redirect to the shipped pages", async ({ page }) => {
  for (const [from, to] of [["/soon/talent-signals", "/signals/talent"], ["/soon/news", "/news"], ["/soon/revenue-valuation", "/revenue-valuation"], ["/soon/agents", "/agents"], ["/soon/mcp", "/mcp"]]) {
    const r = await page.goto(from!);
    expect(r?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(to);
  }
});

test("API explorer switches samples and MCP URL is shown", async ({ page }) => {
  await page.goto("/api");
  await page.getByRole("tab", { name: /Revenue estimate/ }).click();
  await expect(page.locator('[data-section="api.explorer"]')).toContainText("est_revenue_usd");
  await page.goto("/mcp");
  await expect(page.locator('[data-section="mcp.connect"] code')).toContainText("/mcp");
  await expect(page.locator('[data-section="mcp.tools"]')).toContainText("get_company_profile");
});
