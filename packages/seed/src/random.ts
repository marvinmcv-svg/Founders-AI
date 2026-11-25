/** Deterministic PRNG helpers (mulberry32). Same seed → same universe. */

export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    if (!xs.length) throw new Error("pick from empty array");
    return xs[Math.floor(this.next() * xs.length)] as T;
  }
  pickN<T>(xs: readonly T[], n: number): T[] {
    const copy = [...xs];
    const out: T[] = [];
    while (out.length < n && copy.length) {
      const i = Math.floor(this.next() * copy.length);
      out.push(copy.splice(i, 1)[0] as T);
    }
    return out;
  }
  weighted<T>(xs: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < xs.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return xs[i] as T;
    }
    return xs[xs.length - 1] as T;
  }
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Log-normal between roughly lo and hi (5th–95th pct). */
  logRange(lo: number, hi: number): number {
    const mu = (Math.log(lo) + Math.log(hi)) / 2;
    const sigma = (Math.log(hi) - Math.log(lo)) / 3.3;
    return Math.exp(this.normal(mu, sigma));
  }
  hex(len: number): string {
    let s = "";
    while (s.length < len) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
