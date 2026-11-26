/** Dataset file encoders for bulk delivery: Parquet (default) or CSV with formula-injection guards. */
import { createHash } from "node:crypto";
import { csvSafe } from "../network/csv";
import { writeParquet, type ParquetColumn } from "./parquet";

export type BulkFormat = "CSV" | "PARQUET";

export function encodeDataset(format: BulkFormat, columns: ParquetColumn[], rows: Record<string, unknown>[], meta: Record<string, string> = {}): { body: Uint8Array; contentType: string; ext: string } {
  if (format === "PARQUET") return { body: writeParquet(columns, rows, meta), contentType: "application/vnd.apache.parquet", ext: "parquet" };
  const lines = [columns.map((c) => csvSafe(c.name)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvSafe(typeof r[c.name] === "object" && r[c.name] !== null ? JSON.stringify(r[c.name]) : r[c.name])).join(","));
  return { body: new TextEncoder().encode(lines.join("\n") + "\n"), contentType: "text/csv; charset=utf-8", ext: "csv" };
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
