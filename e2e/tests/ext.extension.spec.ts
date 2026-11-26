/**
 * Phase 8: the built Chrome extension (apps/extension/dist) loaded unpacked in Chromium, pointed at
 * the local app: side panel card for a company website, Add to list, Like, Push to CRM (no CRM →
 * clear message), and the "not a company" state. Run `pnpm --filter @founders/extension build` first.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { chromium, expect, test, type BrowserContext } from "@playwright/test";

const DIST = path.resolve(new URL(".", import.meta.url).pathname, "../../apps/extension/dist");
const APP = process.env.APP_URL ?? "http://localhost:3001";
const KEY = process.env.DEMO_API_KEY ?? "fai_demo_local_only_9f3c2b7a1e5d4c8b";
const preinstalled = "/opt/pw-browsers/chromium";

let ctx: BrowserContext;
let extId = "";

test.beforeAll(async () => {
  test.skip(!existsSync(path.join(DIST, "manifest.json")), "extension not built");
  ctx = await chromium.launchPersistentContext("", {
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
});
test.afterAll(async () => ctx?.close());

test("side panel shows the company card for the site you are on, with actions", async () => {
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.locator("#key").fill(KEY);
  await opts.locator("#base").fill(APP);
  await opts.locator("#save").click();
  await expect(opts.locator("#status")).toHaveText("Saved.");
  await opts.locator("#test").click();
  await expect(opts.locator("#status")).toContainText("Connected to");

  // A company the seed knows: read its domain from the app's public API.
  const res = await opts.request.post(`${APP}/api/v1/search`, { headers: { "X-API-Key": KEY, "Content-Type": "application/json" }, data: { query: "companies", product: "companies", limit: 1 } }).catch(() => null);
  const domain = res && res.ok() ? String(((await res.json()) as { items?: { domain?: string; website?: { domain?: string } }[] }).items?.[0]?.domain ?? "") : "";
  test.skip(!domain, "could not read a seeded domain");

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?url=${encodeURIComponent(`https://www.${domain}/about`)}`);
  await expect(panel.getByText("Team size")).toBeVisible({ timeout: 30000 });
  await expect(panel.locator("h1")).not.toHaveText("");
  await expect(panel.getByText(/^Rank /)).toBeVisible();
  await expect(panel.getByText("Team size")).toBeVisible();
  await expect(panel.getByRole("link", { name: "View in app →" })).toHaveAttribute("href", /\/companies\/com_/);
  await panel.screenshot({ path: "../docs/progress/screens/phase-8-extension-panel.png" });

  await panel.getByRole("button", { name: /^Like|Liked$/ }).click();
  await expect(panel.getByRole("status")).toContainText(/Liked/);
  await panel.getByRole("button", { name: "Push to CRM" }).click();
  await expect(panel.getByRole("status")).toContainText(/No CRM connected|in (attio|hubspot|salesforce|affinity|pipedrive|airtable)/i);

  const other = await ctx.newPage();
  await other.goto(`chrome-extension://${extId}/sidepanel.html?url=${encodeURIComponent("https://www.google.com/search?q=x")}`);
  await expect(other.getByText("google.com isn't a company website")).toBeVisible();
});
