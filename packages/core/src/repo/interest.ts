/**
 * Interest-signal read side (plan 7.10 "Round forming" + forecast card). Every function checks the
 * `interest_signals` flag for the caller's org and returns nothing when it is off (H8).
 */
import { sql } from "drizzle-orm";
import { raiseForecast, type FirmEngagement } from "../signals/interest";
import { rawQuery as q } from "./entities";
import { isFlagOn } from "./flags";
import type { OrgContext } from "./workspace";

export type RoundForming = {
  firms: (FirmEngagement & { sourceType: string; evidence: string | null })[];
  timeline: { date: string; investor: string; source: string; score: number }[];
  forecast: { probability: number; likelyLead: string | null; momentum: number };
};

export async function getRoundForming(ctx: OrgContext, companyId: string): Promise<RoundForming | null> {
  if (!(await isFlagOn("interest_signals", ctx.orgId))) return null;
  const rows = await q<{ investor_id: string | null; investor_name: string | null; investor_type: string; score: number; signal_date: string; source_type: string; evidence: string | null; leads: number; funding_context: { evidence?: { source: string; date: string }[] } | null }>(sql`
    SELECT s.investor_id, i.name AS investor_name, s.investor_type, s.score, s.signal_date::text, s.source_type, s.evidence, COALESCE(i.leads_count, 0) AS leads, s.funding_context
    FROM interest_signals s LEFT JOIN investors i ON i.id = s.investor_id WHERE s.target_company_id = ${companyId} ORDER BY s.score DESC, s.signal_date DESC`);
  if (!rows.length) return null;
  const [c] = await q<{ last_funding_date: string | null; headcount_growth_3m: number | null }>(sql`SELECT last_funding_date::text, headcount_growth_3m FROM companies WHERE id = ${companyId}`);
  const firms = rows.map((r) => ({ investorId: r.investor_id, investorName: r.investor_name ?? `${r.investor_type} investor`, investorType: r.investor_type, score: r.score, lastDate: r.signal_date, leads: r.leads, sourceType: r.source_type, evidence: r.evidence }));
  const months = c?.last_funding_date ? (Date.now() - new Date(c.last_funding_date).getTime()) / (30.4 * 86_400_000) : null;
  const f = raiseForecast(firms, months, c?.headcount_growth_3m ?? null);
  const timeline = rows
    .flatMap((r) => (r.funding_context?.evidence ?? []).map((e) => ({ date: e.date, investor: r.investor_name ?? `${r.investor_type} investor`, source: e.source, score: r.score })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);
  return { firms, timeline, forecast: { probability: f.probability, likelyLead: f.likelyLead?.investorName ?? null, momentum: f.momentum } };
}

/** Interest signals on a company / by an investor / one signal — API #14, #28, #36, #37. */
export async function interestFor(ctx: OrgContext, by: { companyId?: string; investorId?: string; signalId?: string }) {
  if (!(await isFlagOn("interest_signals", ctx.orgId))) return null;
  const where = by.signalId ? sql`s.id = ${by.signalId}` : by.companyId ? sql`s.target_company_id = ${by.companyId}` : by.investorId ? sql`s.investor_id = ${by.investorId}` : sql`TRUE`;
  return q(sql`SELECT s.id, s.target_company_id, c.name AS target_name, s.investor_id, i.name AS investor_name, s.investor_type, s.score, s.signal_date::text AS signal_date, s.source_type, s.evidence
    FROM interest_signals s JOIN companies c ON c.id = s.target_company_id LEFT JOIN investors i ON i.id = s.investor_id
    WHERE ${where} ORDER BY s.signal_date DESC, s.id LIMIT 5000`);
}
