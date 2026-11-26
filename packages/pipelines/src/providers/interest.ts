/**
 * Interest evidence provider (plan 9.4). The interface is what licensed / API sources implement
 * (X and GitHub follows, investor blogs and podcasts, public event rosters, Form D). The synthetic
 * provider generates labelled, plausible public evidence from the seed universe (D-028).
 */
import { Rng } from "@founders/core/random";
import type { Evidence, InterestSource } from "@founders/core/signals/interest";

export type Target = { id: string; name: string; growthStage: string; sectorId: string | null; lastFundingDate: string | null; headcountGrowth3m: number | null };
export type InvestorLite = { id: string; name: string; type: string; targetStages: string[]; sectors: string[] };
export type InterestEvidence = { investorId: string; evidence: (Evidence & { detail: string })[] };

export interface InterestEvidenceProvider {
  evidenceFor(target: Target, candidates: InvestorLite[], now: Date): InterestEvidence[];
}

const DETAIL: Record<InterestSource, (inv: string, co: string) => string> = {
  SOCIAL_FOLLOW: (inv, co) => `A partner at ${inv} started following ${co}'s founders on X`,
  PUBLIC_CONTENT: (inv, co) => `${inv} mentioned ${co} in a public newsletter`,
  EVENT: (inv, co) => `${inv} and ${co} both appeared on a public demo-day roster`,
  FILING: (inv, co) => `A Form D filed by ${co} lists ${inv} as a related person`,
};

export class SyntheticInterestProvider implements InterestEvidenceProvider {
  evidenceFor(t: Target, candidates: InvestorLite[], now: Date): InterestEvidence[] {
    const seed = [...t.id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 11);
    const rng = new Rng(seed);
    // Momentum: growing companies 12–30 months after their last round attract more attention.
    const months = t.lastFundingDate ? (now.getTime() - new Date(t.lastFundingDate).getTime()) / (30.4 * 86_400_000) : 36;
    const hot = (t.headcountGrowth3m ?? 0) > 0.15 && months > 9 && months < 32;
    const firms = rng.int(0, hot ? 7 : 2);
    const fits = candidates.filter((i) => i.targetStages.includes(t.growthStage) || (t.sectorId && i.sectors.includes(t.sectorId)));
    const pool = fits.length >= firms ? fits : candidates;
    const out: InterestEvidence[] = [];
    const used = new Set<string>();
    for (let k = 0; k < firms && pool.length; k++) {
      const inv = rng.pick(pool);
      if (used.has(inv.id)) continue;
      used.add(inv.id);
      const n = rng.int(1, hot ? 4 : 2);
      const evidence: (Evidence & { detail: string })[] = [];
      for (let e = 0; e < n; e++) {
        const r = rng.next();
        const source: InterestSource = r < 0.45 ? "SOCIAL_FOLLOW" : r < 0.75 ? "PUBLIC_CONTENT" : r < 0.95 ? "EVENT" : "FILING";
        const date = new Date(now.getTime() - rng.int(0, 120) * 86_400_000).toISOString().slice(0, 10);
        evidence.push({ source, date, detail: DETAIL[source](inv.name, t.name) });
      }
      out.push({ investorId: inv.id, evidence });
    }
    return out;
  }
}
