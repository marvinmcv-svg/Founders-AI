/**
 * Comparison / alternatives pages (plan 6.17). Each page is a reviewed JSON file in /content/comparisons.
 * Files starting with "_" are drafts and never published. A file is published only with `reviewed: true`,
 * a `reviewedBy`, an `asOf` date and at least one source (BLOCKED-HUMAN: legal review of competitor claims).
 * Invalid files fail the build rather than shipping unsourced claims.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const DIR = path.join(process.cwd(), "../../content/comparisons");
const cell = z.union([z.literal("yes"), z.literal("no"), z.literal("partial"), z.string().max(120)]);

export const ComparisonSchema = z.object({
  kind: z.enum(["versus", "alternatives"]),
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(300),
  competitor: z.string().min(1).max(80),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviewed: z.literal(true),
  reviewedBy: z.string().min(2),
  overview: z.object({ us: z.object({ whatItIs: z.string(), bestAt: z.string(), bestFor: z.string() }), them: z.object({ whatItIs: z.string(), bestAt: z.string(), bestFor: z.string() }) }),
  choose: z.array(z.object({ title: z.string(), body: z.string() })).length(3),
  features: z.array(z.object({ group: z.string(), rows: z.array(z.object({ feature: z.string(), us: cell, them: cell })).min(1) })).min(1),
  differences: z.array(z.object({ title: z.string(), body: z.string() })).max(4),
  pricing: z.array(z.object({ label: z.string(), us: z.string(), them: z.string() })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  sources: z.array(z.object({ label: z.string(), url: z.string().url(), accessed: z.string() })).min(1),
});
export type Comparison = z.infer<typeof ComparisonSchema> & { slug: string };

export function loadComparison(slug: string, raw: string): Comparison {
  const parsed = ComparisonSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`content/comparisons/${slug}.json is not publishable: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return { ...parsed.data, slug };
}

export function allComparisons(): Comparison[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  } catch {
    return [];
  }
  return files.map((f) => loadComparison(f.replace(/\.json$/, ""), readFileSync(path.join(DIR, f), "utf8")));
}

export function getComparison(slug: string): Comparison | undefined {
  return allComparisons().find((c) => c.slug === slug);
}
