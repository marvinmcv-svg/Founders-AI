/**
 * Output helpers (plan 12): compact, memo-ready markdown plus structured JSON, capped so a tool result
 * stays around 4k tokens, with `next_cursor` for more.
 */
import { z } from "zod";

export const OUTPUT_MAX_CHARS = 14_000; // ≈ 4k tokens
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export const pageInput = {
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe(`Rows per page (max ${MAX_LIMIT}).`),
  cursor: z.string().max(200).optional().describe("Opaque `next_cursor` from a previous call."),
};

export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: number };
    return Math.max(0, Number(o.o) || 0);
  } catch {
    return 0;
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function page<T>(all: T[], limit: number, cursor?: string) {
  const offset = decodeCursor(cursor);
  const items = all.slice(offset, offset + limit);
  const next = offset + items.length < all.length ? encodeCursor(offset + items.length) : null;
  return { items, total: all.length, next_cursor: next };
}

export function usd(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const t = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, "");
  if (a >= 1e9) return `$${t(v / 1e9)}B`;
  if (a >= 1e6) return `$${t(v / 1e6)}M`;
  if (a >= 1e3) return `$${t(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

export const num = (n: unknown) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("en-US"));
export const pct = (n: unknown) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${Number(n) > 0 ? "+" : ""}${(Number(n) * 100).toFixed(1).replace(/\.0$/, "")}%`);
export const day = (d: unknown) => (d ? String(d).slice(0, 10) : "—");
export const str = (v: unknown) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v));

/** Markdown table from rows (cells escaped for pipes). */
export function table(rows: Record<string, unknown>[], cols: [string, string, (r: Record<string, unknown>) => string][]): string {
  if (!rows.length) return "_No results._";
  const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
  return [`| ${cols.map((c) => c[1]).join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${cols.map((c) => cell(c[2](r))).join(" | ")} |`)].join("\n");
}

/** Truncate markdown to the output cap, telling the client how to get the rest. */
export function cap(markdown: string, nextCursor?: string | null): string {
  const tail = nextCursor ? `\n\n_More results: call again with \`cursor: "${nextCursor}"\`._` : "";
  if (markdown.length + tail.length <= OUTPUT_MAX_CHARS) return markdown + tail;
  return `${markdown.slice(0, OUTPUT_MAX_CHARS - tail.length - 60)}\n\n_…truncated to keep this result small._${tail}`;
}
