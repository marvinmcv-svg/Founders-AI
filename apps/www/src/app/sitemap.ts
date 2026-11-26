import type { MetadataRoute } from "next";
import { brand } from "@founders/config";

const ROUTES = ["", "/platform", "/companies", "/people", "/investors", "/transactions", "/signals/talent", "/news", "/revenue-valuation", "/agents", "/api", "/mcp", "/pricing", "/contact", "/partners", "/privacy-policy", "/privacy-rights", "/terms-conditions", "/dpa"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((r) => ({ url: `${brand.urls.www}${r}`, changeFrequency: "weekly", priority: r === "" ? 1 : 0.7 }));
}
