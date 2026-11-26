/** Content rules for the marketing site (plan 6.17, 1.2): blog parsing, live numbers, comparison gating. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allPosts, allTags, getPost, parseFrontmatter, readingMinutes, relatedPosts, renderMarkdown } from "@/lib/blog";
import { ComparisonSchema, allComparisons, loadComparison } from "@/lib/comparisons";
import { isNumericStat } from "@/lib/stats";

process.chdir(path.resolve(__dirname, ".."));

describe("blog", () => {
  it("parses frontmatter scalars and lists", () => {
    const { data, body } = parseFrontmatter("---\ntitle: Hello\ntags: [a, b]\n---\nBody text");
    expect(data).toEqual({ title: "Hello", tags: ["a", "b"] });
    expect(body).toBe("Body text");
  });

  it("loads published posts newest first, with required fields", () => {
    const posts = allPosts();
    expect(posts.length).toBeGreaterThanOrEqual(3);
    for (const p of posts) {
      expect(p.title.length).toBeGreaterThan(5);
      expect(p.description.length).toBeGreaterThan(20);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.tags.length).toBeGreaterThan(0);
    }
    expect([...posts].sort((a, b) => b.date.localeCompare(a.date)).map((p) => p.slug)).toEqual(posts.map((p) => p.slug));
    expect(allTags()).toContain("insights");
  });

  it("fills live variables and never leaves stats/limits placeholders", () => {
    const vars = { "stats.companies": "10K+", "stats.people": "50K+", "stats.investors": "600+", "stats.transactions": "9.3K+", "stats.revenue_disclosures": "470+", "limits.endpoints": 74, "limits.mcpTools": 29, "limits.mcpFree": 100, "limits.mcpReadTools": 24, "limits.mcpWriteTools": 5 };
    for (const p of allPosts()) {
      const html = renderMarkdown(p.body, vars);
      expect(html).not.toMatch(/\{(stats|limits)\.[\w]+\}/);
    }
    expect(renderMarkdown("**{stats.companies}** companies", vars)).toContain("<strong>10K+</strong>");
  });

  it("has no hard-coded coverage numbers in posts (plan 1.2)", () => {
    for (const p of allPosts()) expect(p.body).not.toMatch(/\b\d[\d,.]*\s?(K|M|B)\+/);
  });

  it("related posts exclude the post itself; reading time is at least a minute", () => {
    const p = getPost("how-we-estimate-private-company-revenue")!;
    expect(relatedPosts(p).map((x) => x.slug)).not.toContain(p.slug);
    expect(readingMinutes("one two")).toBe(1);
  });
});

describe("comparisons", () => {
  it("publishes nothing that is not reviewed and sourced", () => {
    const draft = JSON.parse(readFileSync(path.resolve(__dirname, "../../../content/comparisons/_template.json"), "utf8")) as Record<string, unknown>;
    expect(ComparisonSchema.safeParse({ ...draft, reviewed: false }).success).toBe(false);
    expect(ComparisonSchema.safeParse({ ...draft, sources: [] }).success).toBe(false);
    expect(() => loadComparison("x", JSON.stringify({ ...draft, asOf: "soon" }))).toThrow(/not publishable/);
  });

  it("drafts (files starting with _) are never listed", () => {
    expect(allComparisons().map((c) => c.slug)).not.toContain("_template");
  });
});

describe("stats", () => {
  it("tells formatted numbers from word fallbacks", () => {
    expect(isNumericStat("10K+")).toBe(true);
    expect(isNumericStat("1.2M+")).toBe(true);
    expect(isNumericStat("640")).toBe(true);
    expect(isNumericStat("thousands of")).toBe(false);
  });
});
