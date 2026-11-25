/**
 * Public JSON shapes (plan 11 "Company JSON shape") + redistribution filter (plan Rule 10):
 * fields whose provenance says redistributable=false are removed before leaving the API.
 */
import { taxonomyName } from "@founders/core/taxonomy";
import type { Row } from "@founders/core/repo";

type Prov = Record<string, { redistributable?: boolean }> | null | undefined;

function blocked(prov: Prov): Set<string> {
  const out = new Set<string>();
  if (!prov) return out;
  for (const [field, p] of Object.entries(prov)) if (p && p.redistributable === false) out.add(field);
  return out;
}

export function redistributable<T extends Row>(row: T): T {
  const deny = blocked(row.provenance as Prov);
  const copy: Row = { ...row };
  delete copy.provenance;
  delete copy.embedding;
  delete copy.deleted_at;
  if (deny.has("*")) return {} as T;
  for (const f of deny) delete copy[f];
  return copy as T;
}

const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export function companyJson(c: Row, extra: { founders?: Row[]; investors?: Row[] } = {}) {
  const r = redistributable(c);
  return {
    id: r.id,
    organization_name: r.name,
    organization_rank: r.rank,
    tagline: r.tagline,
    description: r.description,
    customer_focus: r.customer_focus,
    operating_status: r.operating_status,
    growth_stage: r.growth_stage,
    founded_year: r.founded_year,
    sector: r.sector_id ? { id: r.sector_id, name: taxonomyName(String(r.sector_id)) } : null,
    industries: arr(r.industry_ids).map((id) => ({ id, name: taxonomyName(id) })),
    tech_verticals: arr(r.tech_vertical_ids).map((id) => ({ id, name: taxonomyName(id) })),
    ecosystems: arr(r.ecosystem_ids).map((id) => ({ id, name: taxonomyName(id) })),
    business_models: r.business_models,
    highlights: r.highlights,
    new_highlights: r.new_highlights,
    regions: r.hq_region ? [r.hq_region] : [],
    hq: { city: r.hq_city, state: r.hq_state, country: r.hq_country, region: r.hq_region },
    website: { domain: r.domain, url: r.domain ? `https://${String(r.domain)}` : null, domain_aliases: r.domain_aliases },
    organization_name_aliases: r.aliases,
    contact: { email: r.contact_email },
    employee_count: r.employee_count,
    employee_count_range: r.employee_range,
    founders: (extra.founders ?? []).map((f) => ({ id: f.id, full_name: f.full_name, title: f.title })),
    founder_count: extra.founders?.length,
    investors: (extra.investors ?? []).map((i) => ({ id: i.id, name: i.name, is_lead: i.is_lead })),
    investor_count: r.investor_count,
    funding: {
      total_funding_usd: r.total_funding_usd,
      last_funding_usd: r.last_funding_usd,
      last_funding_date: r.last_funding_date,
      last_funding_type: r.last_funding_type,
      round_count: r.round_count,
      post_money_valuation_usd: r.post_money_valuation_usd,
    },
    revenue_estimate_usd: r.est_revenue_usd,
    valuation_estimate_usd: r.est_valuation_usd,
    web: { visits: r.web_visits, visits_growth_3m_pct: pct(r.web_visits_growth_3m) },
    traction_metrics: {
      employee_count: { latest: r.employee_count, "3mo": { percentage: pct(r.headcount_growth_3m) }, "12mo": { percentage: pct(r.headcount_growth_12m) } },
      linkedin_followers: { latest: r.linkedin_followers, "3mo": { percentage: pct(r.social_growth_3m) } },
      web_visits: { latest: r.web_visits, "3mo": { percentage: pct(r.web_visits_growth_3m) } },
    },
    patent_count: r.patent_count,
    trademark_count: r.trademark_count,
    technologies: r.technologies,
    certifications: r.certifications,
    customer_profile: r.customer_profile,
    traction_highlights: r.traction_highlights,
    socials: r.socials,
    reviews: r.reviews,
    last_updated: r.updated_at,
  };
}

function pct(v: unknown) {
  return v === null || v === undefined ? null : Math.round(Number(v) * 1000) / 10;
}

export function personJson(p: Row) {
  const r = redistributable(p);
  return {
    id: r.id,
    full_name: r.full_name,
    first_name: r.first,
    last_name: r.last,
    headline: r.headline,
    bio: r.bio,
    location: r.location,
    country: r.country,
    current_title: r.current_title,
    current_company: r.current_company_id ? { id: r.current_company_id, name: r.current_company_name } : null,
    department: r.department,
    seniority: r.seniority,
    years_experience: r.years_experience,
    highlights: r.highlights,
    education: r.education_summary,
    followers: r.followers,
    connections: r.connections,
    socials: { linkedin: r.linkedin_url, x: r.x_url, github: r.github_url },
    talent_signal_count: r.talent_signal_count,
  };
}

export function investorJson(i: Row) {
  const r = redistributable(i);
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    domain: r.domain,
    description: r.description,
    hq: { city: r.hq_city, country: r.hq_country },
    founded_year: r.founded_year,
    aum_usd: r.aum_usd,
    check_size_usd: { min: r.check_min, max: r.check_max },
    target_stages: r.target_stages,
    geographies: r.geographies,
    sectors: arr(r.sectors).map((id) => ({ id, name: taxonomyName(id) })),
    stats: {
      investments: r.investments_count,
      exits: r.exits_count,
      leads: r.leads_count,
      follow_on_rate: r.follow_on_rate,
      unicorns: r.unicorn_count,
    },
    highlights: r.highlights,
  };
}
