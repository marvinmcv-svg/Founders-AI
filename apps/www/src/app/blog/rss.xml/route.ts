import { brand } from "@founders/config";
import { allPosts } from "@/lib/blog";
import { t } from "@/lib/copy";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed for the blog (plan 6.17). */
export function GET() {
  const items = allPosts()
    .map((p) => {
      const url = `${brand.urls.www}/blog/${p.slug}`;
      return `<item><title>${esc(p.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${esc(p.description.replace(/\{[\w.]+\}/g, "").trim())}</description>${p.tags.map((x) => `<category>${esc(x)}</category>`).join("")}</item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(`${brand.name} · ${t("blog.meta.title")}`)}</title><link>${brand.urls.www}/blog</link><description>${esc(t("blog.meta.description"))}</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
