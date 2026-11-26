/**
 * Interest signals job (plan 9.4) — runs only while the `interest_signals` flag is on somewhere
 * (legal sign-off H8). Public evidence only; one signal per investor × target, re-scored daily.
 */
import { newId } from "@founders/core/ids";
import { listFlags } from "@founders/core/repo";
import { interestScore, type InterestSource } from "@founders/core/signals/interest";
import { pg, type Json } from "../db";
import { SyntheticInterestProvider, type InterestEvidenceProvider, type InvestorLite } from "../providers/interest";
import type { JobDef } from "../runner";

const STRONGEST: InterestSource[] = ["FILING", "PUBLIC_CONTENT", "EVENT", "SOCIAL_FOLLOW"];

export const interestJob: JobDef = {
  name: "interest",
  description: "Score investor-interest signals from public evidence (only while the interest_signals flag is on)",
  async run(ctx) {
    const flag = (await listFlags()).find((f) => f.key === "interest_signals");
    if (!flag?.enabled && !ctx.options.force) {
      ctx.log("interest_signals flag is off (H8) — nothing to do");
      ctx.count("skipped_flag_off", 1);
      return;
    }
    const sql = pg();
    const provider: InterestEvidenceProvider = new SyntheticInterestProvider();
    const now = new Date();
    const targets = await sql<{ id: string; name: string; growth_stage: string; sector_id: string | null; last_funding_date: string | null; headcount_growth_3m: number | null }[]>`
      SELECT id, name, growth_stage, sector_id, last_funding_date::text, headcount_growth_3m FROM companies
      WHERE deleted_at IS NULL AND growth_stage NOT IN ('Exit / Public') ORDER BY rank NULLS LAST LIMIT ${Number(ctx.options.limit ?? 4000)}`;
    const investors = await sql<{ id: string; name: string; type: string; target_stages: string[]; sectors: string[] }[]>`
      SELECT id, name, type, target_stages, sectors FROM investors WHERE deleted_at IS NULL`;
    const cands: InvestorLite[] = investors.map((i) => ({ id: i.id, name: i.name, type: i.type, targetStages: i.target_stages ?? [], sectors: i.sectors ?? [] }));
    const typeOf = new Map(investors.map((i) => [i.id, i.type]));
    const rows: { id: string; target_company_id: string; investor_id: string; investor_type: string; score: number; signal_date: string; source_type: string; evidence: string; funding_context: Json }[] = [];
    for (const t of targets) {
      const ev = provider.evidenceFor({ id: t.id, name: t.name, growthStage: t.growth_stage, sectorId: t.sector_id, lastFundingDate: t.last_funding_date, headcountGrowth3m: t.headcount_growth_3m }, cands, now);
      for (const e of ev) {
        const inv = cands.find((c) => c.id === e.investorId);
        const fit = inv ? (inv.targetStages.includes(t.growth_stage) ? 0.6 : 0) + (t.sector_id && inv.sectors.includes(t.sector_id) ? 0.4 : 0) : 0.3;
        const latest = [...e.evidence].sort((a, b) => b.date.localeCompare(a.date))[0]!;
        const strongest = STRONGEST.find((s) => e.evidence.some((x) => x.source === s)) ?? "SOCIAL_FOLLOW";
        rows.push({
          id: newId("interestSignal"),
          target_company_id: t.id,
          investor_id: e.investorId,
          investor_type: normaliseType(typeOf.get(e.investorId)),
          score: interestScore(e.evidence, fit, now),
          signal_date: latest.date,
          source_type: strongest,
          evidence: e.evidence.map((x) => x.detail).join(" · "),
          funding_context: { last_funding_date: t.last_funding_date, evidence: e.evidence.map((x) => ({ source: x.source, date: x.date })), fit } as Json,
        });
      }
    }
    await sql.begin(async (tx) => {
      await tx`DELETE FROM interest_signals`;
      for (let i = 0; i < rows.length; i += 2000) await tx`INSERT INTO interest_signals ${tx(rows.slice(i, i + 2000) as never)}`;
    });
    ctx.count("targets", targets.length);
    ctx.count("signals", rows.length);
  },
};

function normaliseType(t: string | undefined): string {
  const s = (t ?? "").toUpperCase();
  if (s.includes("CORPORATE") || s === "CVC") return "CVC";
  if (s.includes("PRIVATE EQUITY") || s === "PE") return "PE";
  if (s.includes("ANGEL")) return "ANGEL";
  if (s.includes("STRATEGIC")) return "STRATEGIC";
  return "VC";
}
