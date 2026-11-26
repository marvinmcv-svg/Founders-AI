/**
 * Number formatting shared by the rules engine and the source guard: every number the agent writes
 * is produced from a tool value by one of these, so the guard can check it against that value.
 */
export function usd(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${trim(v / 1e9)}B`;
  if (a >= 1e6) return `$${trim(v / 1e6)}M`;
  if (a >= 1e3) return `$${trim(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

export function num(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || !Number.isFinite(v)) return "n/a";
  return Math.round(v).toLocaleString("en-US");
}

/** Growth stored as a ratio (0.12 → +12%) unless `ratio` is false (12 → +12%). */
export function pct(n: unknown, ratio = true): string {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || !Number.isFinite(v)) return "n/a";
  const p = ratio ? v * 100 : v;
  return `${p > 0 ? "+" : ""}${trim(p)}%`;
}

function trim(v: number): string {
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export const day = (d: unknown) => (d ? String(d).slice(0, 10) : "n/a");

/** Inline source chip; the UI renders `[[id]]` as a link to the entity or URL. */
export const chip = (id: string) => `[[${id}]]`;
