/**
 * LinkedIn connections from the member's own **data export** (plan 13.2: official export, never
 * scraping). `Connections.csv` starts with a few "Notes:" lines, then
 * `First Name,Last Name,URL,Email Address,Company,Position,Connected On`. Email is usually empty.
 */
import { normLinkedin } from "../crm/types";
import { parseCsv } from "./csv";

export type LinkedinContact = {
  first: string;
  last: string;
  linkedinUrl: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null; // ISO date
};

export const LINKEDIN_CSV_MAX_BYTES = 20 * 1024 * 1024;
export const LINKEDIN_CSV_MAX_ROWS = 100_000;

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "05 Mar 2024" (export format) or ISO → YYYY-MM-DD. */
export function parseConnectedOn(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(raw.trim());
  if (m) {
    const mon = MONTHS[(m[2] as string).toLowerCase()];
    if (mon === undefined) return null;
    return new Date(Date.UTC(Number(m[3]), mon, Number(m[1]))).toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

export function parseLinkedinConnections(text: string): LinkedinContact[] {
  if (Buffer.byteLength(text, "utf8") > LINKEDIN_CSV_MAX_BYTES) throw new CsvFormatError("The file is larger than 20 MB");
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r.map((c) => c.trim().toLowerCase()).includes("first name") && r.map((c) => c.trim().toLowerCase()).includes("last name"));
  if (headerAt < 0) throw new CsvFormatError("This does not look like LinkedIn's Connections.csv (no First Name / Last Name header)");
  const header = (rows[headerAt] as string[]).map((c) => c.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [fi, li, ui, ei, ci, pi, di] = ["first name", "last name", "url", "email address", "company", "position", "connected on"].map(col) as number[];
  const body = rows.slice(headerAt + 1);
  if (body.length > LINKEDIN_CSV_MAX_ROWS) throw new CsvFormatError(`More than ${LINKEDIN_CSV_MAX_ROWS.toLocaleString()} rows`);
  const at = (r: string[], i: number | undefined) => (i !== undefined && i >= 0 ? (r[i] ?? "").trim() : "");
  return body
    .map((r) => ({
      first: at(r, fi),
      last: at(r, li),
      linkedinUrl: normLinkedin(at(r, ui)),
      email: at(r, ei).toLowerCase() || null,
      company: at(r, ci) || null,
      position: at(r, pi) || null,
      connectedOn: parseConnectedOn(at(r, di)),
    }))
    .filter((c) => c.first || c.last || c.linkedinUrl);
}
