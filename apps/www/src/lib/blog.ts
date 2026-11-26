/**
 * Blog / Insights content (plan 6.17): Markdown files in /content/blog with a small frontmatter block.
 * Posts may use {stats.*} and {limits.*} variables so every number stays live (plan 1.2).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import authorsJson from "../../../../content/blog/authors.json";
import { fill, type Vars } from "./copy";

const DIR = path.join(process.cwd(), "../../content/blog");

export type Author = { slug: string; name: string; role: string; bio: string };
export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  author: string;
  tags: string[];
  body: string;
  readingMinutes: number;
};

export const AUTHORS = authorsJson as Record<string, Omit<Author, "slug">>;

export function author(slug: string): Author {
  const a = AUTHORS[slug];
  return a ? { slug, ...a } : { slug, name: slug, role: "", bio: "" };
}

/** Parses `key: value` and `key: [a, b]` lines between --- fences. */
export function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string | string[]> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1]!;
    const v = (kv[2] ?? "").trim();
    data[key] = v.startsWith("[") && v.endsWith("]") ? v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : v.replace(/^["']|["']$/g, "");
  }
  return { data, body: m[2] ?? "" };
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
}

function toPost(slug: string, raw: string): Post {
  const { data, body } = parseFrontmatter(raw);
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  return {
    slug,
    title: s("title"),
    description: s("description"),
    date: s("date"),
    updated: s("updated") || undefined,
    author: s("author") || "founders-team",
    tags: Array.isArray(data.tags) ? data.tags : [],
    body,
    readingMinutes: readingMinutes(body),
  };
}

/** Published posts, newest first. Files starting with "_" are drafts. */
export function allPosts(): Post[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  } catch {
    return [];
  }
  return files.map((f) => toPost(f.replace(/\.md$/, ""), readFileSync(path.join(DIR, f), "utf8"))).sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): Post | undefined {
  return allPosts().find((p) => p.slug === slug);
}

export function postsByTag(tag: string): Post[] {
  return allPosts().filter((p) => p.tags.includes(tag));
}

export function allTags(): string[] {
  return [...new Set(allPosts().flatMap((p) => p.tags))].sort();
}

/** Related = most shared tags, then newest. */
export function relatedPosts(post: Post, n = 3): Post[] {
  return allPosts()
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, score: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date))
    .slice(0, n)
    .map((x) => x.p);
}

export function renderMarkdown(body: string, vars: Vars): string {
  return marked.parse(fill(body, vars), { async: false, gfm: true });
}

export function formatDate(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
