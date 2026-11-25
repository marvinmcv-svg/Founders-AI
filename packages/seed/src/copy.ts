/** Postgres COPY text-format encoding. */
import type { Cell } from "./generate";

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

function arrayLiteral(xs: unknown[]): string {
  return `{${xs.map((x) => (x === null ? "NULL" : `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

export function encodeCell(v: Cell): string {
  if (v === null || v === undefined) return "\\N";
  if (typeof v === "boolean") return v ? "t" : "f";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "\\N";
  if (typeof v === "string") return escapeText(v);
  if (Array.isArray(v) && v.every((x) => typeof x !== "object" || x === null)) return escapeText(arrayLiteral(v));
  return escapeText(JSON.stringify(v));
}

export function encodeCopyRow(row: Cell[]): string {
  return `${row.map(encodeCell).join("\t")}\n`;
}
