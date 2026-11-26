/**
 * Relationship strength (plan 13.2: recency × frequency × channel), 0–100.
 * Each channel contributes weight × log(1 + count) × recency decay; the sum is squashed so a handful
 * of recent meetings is "strong" and an old LinkedIn connection alone is "weak".
 */
export type Channel = "LINKEDIN" | "EMAIL" | "MEETING";
export type Evidence = Partial<Record<Channel, { count: number; last: string | null }>>;

export const CHANNEL_WEIGHT: Record<Channel, number> = { LINKEDIN: 0.35, EMAIL: 0.6, MEETING: 1.0 };
/** Half-life of an interaction's weight, in days (LinkedIn connections age slowly). */
export const HALF_LIFE_DAYS: Record<Channel, number> = { LINKEDIN: 730, EMAIL: 120, MEETING: 180 };

export function strength(e: Evidence, now: Date = new Date()): number {
  let score = 0;
  for (const ch of Object.keys(e) as Channel[]) {
    const ev = e[ch];
    if (!ev || ev.count <= 0) continue;
    const ageDays = ev.last ? Math.max(0, (now.getTime() - new Date(ev.last).getTime()) / 86_400_000) : HALF_LIFE_DAYS[ch];
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS[ch]);
    score += CHANNEL_WEIGHT[ch] * Math.log1p(ev.count) * decay;
  }
  return Math.round(100 * (1 - Math.exp(-score)) * 10) / 10;
}

export function strengthLabel(s: number): "strong" | "medium" | "weak" {
  return s >= 60 ? "strong" : s >= 30 ? "medium" : "weak";
}

export function lastInteraction(e: Evidence): string | null {
  const ds = Object.values(e)
    .map((v) => v?.last)
    .filter((d): d is string => !!d)
    .sort();
  return ds.at(-1) ?? null;
}
