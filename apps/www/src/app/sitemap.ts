import type { MetadataRoute } from "next";
import { brand } from "@founders/config";
import { AUTHORS, allPosts, allTags } from "@/lib/blog";
import { allComparisons } from "@/lib/comparisons";

const ROUTES = [
  "", "/platform", "/companies", "/people", "/investors", "/transactions", "/signals/talent", "/news", "/revenue-valuation",
  "/agents", "/api", "/mcp", "/integrations", "/pricing", "/contact", "/partners", "/blog", "/insights", "/careers", "/comparisons",
  "/privacy-policy", "/privacy-rights", "/terms-conditions", "/dpa",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const u = (p: string) => `${brand.urls.www}${p}`;
  return [
    ...ROUTES.map((r) => ({ url: u(r), changeFrequency: "weekly" as const, priority: r === "" ? 1 : 0.7 })),
    ...allPosts().map((p) => ({ url: u(`/blog/${p.slug}`), lastModified: p.updated ?? p.date, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...allTags().map((t) => ({ url: u(`/blog/tag/${t}`), changeFrequency: "weekly" as const, priority: 0.4 })),
    ...Object.keys(AUTHORS).map((a) => ({ url: u(`/authors/${a}`), changeFrequency: "monthly" as const, priority: 0.3 })),
    ...allComparisons().map((c) => ({ url: u(`/comparisons/${c.slug}`), lastModified: c.asOf, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
