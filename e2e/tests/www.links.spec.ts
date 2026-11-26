import { expect, test } from "@playwright/test";

/**
 * Link checker (plan 15 Phase 9): every page in the sitemap loads, and every internal link on it
 * resolves (< 400, after redirects) with its #anchor present. External links are not fetched.
 */
test("every internal link and anchor on sitemap pages resolves", async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const base = new URL(baseURL!);
  const xml = await (await request.get("/sitemap.xml")).text();
  const pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(pages.length).toBeGreaterThan(20);

  const links = new Map<string, string>(); // target -> first page that links to it
  for (const p of pages) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(200);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const h of hrefs) {
      if (!h || h.startsWith("mailto:") || h.startsWith("tel:")) continue;
      const u = new URL(h, base);
      if (u.origin !== base.origin) continue;
      const key = u.pathname + u.hash;
      if (!links.has(key)) links.set(key, p);
    }
  }

  const broken: string[] = [];
  const checked = new Map<string, number>();
  for (const [target, from] of links) {
    const [path, hash] = target.split("#");
    if (!checked.has(path!)) checked.set(path!, (await request.get(path!, { maxRedirects: 5 })).status());
    const status = checked.get(path!)!;
    if (status >= 400) broken.push(`${target} (${status}) linked from ${from}`);
    else if (hash) {
      await page.goto(path!);
      if ((await page.locator(`[id="${decodeURIComponent(hash)}"]`).count()) === 0) broken.push(`${target} (missing #${hash}) linked from ${from}`);
    }
  }
  expect(broken).toEqual([]);
});
