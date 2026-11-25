/** Per-IP fixed-window limiter for public forms (plan 14.4). In-memory; Redis in production (H2). */
const hits = new Map<string, { n: number; reset: number }>();
export function allow(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n++;
  return h.n <= max;
}
export function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
