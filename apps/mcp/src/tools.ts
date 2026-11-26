/**
 * The 29 MCP tools of plan Section 12 (24 read + 5 write). Each returns compact markdown for the
 * model and structured JSON, plus the credits it would cost at the Section 11 price table (misses
 * are free). The server wrapper (server.ts) meters calls against the daily allowance.
 */
import { z } from "zod";
import { companyJson, investorJson, personJson, redistributable } from "@founders/api/serialize";
import { PRODUCTS, type Product } from "@founders/core/filters";
import { nlToQuery } from "@founders/core/nl";
import { CREDIT_PRICES, pageCost } from "@founders/core/pricing";
import * as repo from "@founders/core/repo";
import { cap, day, num, page, pageInput, pct, str, table, usd } from "./format";

export type McpPrincipal = repo.OrgContext & { via: "oauth" | "api_key"; clientId: string };
export type ToolOutput = { markdown: string; data: Record<string, unknown>; credits: number; matched: boolean };
type Row = Record<string, unknown>;

export type McpTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  input: S;
  /** Paid tools draw credits after the daily allowance (if overage is on); free tools never do. */
  paid: boolean;
  write?: boolean;
  destructive?: boolean;
  run: (p: McpPrincipal, input: z.infer<S>) => Promise<ToolOutput>;
};

const def = <S extends z.ZodObject>(t: McpTool<S>) => t;
const id = (what: string) => z.string().min(4).max(64).describe(`${what} id`);
const BY_ID = CREDIT_PRICES["entity.by_id"];
const ESTIMATE = CREDIT_PRICES["estimates.record"];
const miss = (what: string): ToolOutput => ({ markdown: `No ${what} found. Misses are free.`, data: { found: false }, credits: 0, matched: false });
const R3 = (what: string): ToolOutput => ({
  markdown: `${what} are not enabled for this workspace yet (legal review of interest sources is pending). This call is free.`,
  data: { available: false, available_in: "R3" },
  credits: 0,
  matched: false,
});

const linkCols = (nameKey = "name"): [string, string, (r: Row) => string] => [nameKey, "Name", (r) => `${str(r[nameKey])} (\`${str(r.id)}\`)`];
const COMPANY_COLS: [string, string, (r: Row) => string][] = [linkCols(), ["growth_stage", "Stage", (r) => str(r.growth_stage)], ["hq_country", "HQ", (r) => str(r.hq_country)], ["employee_count", "Employees", (r) => num(r.employee_count)], ["headcount_growth_3m", "Headcount 3 mo", (r) => pct(r.headcount_growth_3m)], ["total_funding_usd", "Raised", (r) => usd(r.total_funding_usd)]];
const PRODUCT_COLS: Partial<Record<Product, [string, string, (r: Row) => string][]>> = {
  companies: COMPANY_COLS,
  people: [linkCols("full_name"), ["current_title", "Title", (r) => str(r.current_title)], ["current_company_name", "Company", (r) => str(r.current_company_name)], ["location", "Location", (r) => str(r.location)]],
  investors: [linkCols(), ["type", "Type", (r) => str(r.type)], ["hq_country", "HQ", (r) => str(r.hq_country)], ["investments_count", "Investments", (r) => num(r.investments_count)]],
  funding_rounds: [["company_name", "Company", (r) => `${str(r.company_name)} (\`${str(r.company_id)}\`)`], ["type", "Round", (r) => str(r.type)], ["amount_usd", "Amount", (r) => usd(r.amount_usd)], ["announced_date", "Date", (r) => day(r.announced_date)]],
  talent_signals: [["person_name", "Person", (r) => `${str(r.person_name)} (\`${str(r.person_id)}\`)`], ["type", "Signal", (r) => str(r.type)], ["score", "Score", (r) => str(r.score)], ["summary", "Summary", (r) => str(r.summary).slice(0, 140)], ["signal_date", "Date", (r) => day(r.signal_date)]],
  news_signals: [["company_name", "Company", (r) => `${str(r.company_name)} (\`${str(r.company_id)}\`)`], ["title", "Headline", (r) => str(r.title)], ["category", "Category", (r) => str(r.category)], ["published_at", "Published", (r) => day(r.published_at)]],
  acquisitions: [["target_name", "Target", (r) => str(r.target_name)], ["acquirer_name", "Acquirer", (r) => str(r.acquirer_name)], ["amount_usd", "Amount", (r) => usd(r.amount_usd)], ["date", "Date", (r) => day(r.date)]],
  ipos: [["company_name", "Company", (r) => str(r.company_name)], ["exchange", "Exchange", (r) => str(r.exchange)], ["valuation_usd", "Valuation", (r) => usd(r.valuation_usd)], ["date", "Date", (r) => day(r.date)]],
};

function pageOut(title: string, rows: Row[], input: { limit: number; cursor?: string }, cols: [string, string, (r: Row) => string][], per100: number = CREDIT_PRICES["feed.per_100"], extra: Row = {}): ToolOutput {
  const p = page(rows.map((r) => redistributable(r as repo.Row) as Row), input.limit, input.cursor);
  return {
    markdown: cap(`### ${title}\n${num(p.total)} total.\n\n${table(p.items, cols)}`, p.next_cursor),
    data: { ...extra, total: p.total, items: p.items, next_cursor: p.next_cursor },
    credits: pageCost(p.items.length, per100),
    matched: p.items.length > 0,
  };
}

/* ======================= Resolve & search (4) ======================= */

const findCompany = def({
  name: "find_company",
  title: "Find company",
  description: "Resolve a company from its domain, name or LinkedIn URL to a company id (free). Use the id with the get_company_* tools.",
  input: z.object({ domain: z.string().max(200).optional(), name: z.string().max(200).optional(), linkedin_url: z.string().max(300).optional() }),
  paid: false,
  async run(_p, i) {
    const domain = i.domain ?? (i.linkedin_url ? undefined : undefined);
    const [r] = await repo.resolveCompanies([{ domain, name: i.name ?? (i.linkedin_url ? decodeURIComponent(i.linkedin_url.split("/company/")[1]?.split("/")[0] ?? "").replace(/-/g, " ") : undefined) }]);
    if (!r?.company_id) return miss("company");
    const c = await repo.getCompany(r.company_id);
    return { markdown: `**${str(c?.name)}** (\`${r.company_id}\`) · ${str(c?.domain)} · ${str(c?.growth_stage)} · ${str(c?.hq_country)} — match confidence ${r.confidence}`, data: { company_id: r.company_id, name: c?.name, domain: c?.domain, confidence: r.confidence }, credits: 0, matched: true };
  },
});

const findPerson = def({
  name: "find_person",
  title: "Find person",
  description: "Resolve a person from a LinkedIn URL, email or name to a person id (free).",
  input: z.object({ linkedin_url: z.string().max(300).optional(), email: z.string().max(200).optional(), name: z.string().max(200).optional() }),
  paid: false,
  async run(_p, i) {
    const [r] = await repo.resolvePeople([{ linkedin_url: i.linkedin_url, email: i.email, name: i.name }]);
    if (!r?.person_id) return miss("person");
    const x = await repo.getPerson(r.person_id);
    return { markdown: `**${str(x?.full_name)}** (\`${r.person_id}\`) · ${str(x?.current_title)} at ${str(x?.current_company_name)} — match confidence ${r.confidence}`, data: { person_id: r.person_id, name: x?.full_name, confidence: r.confidence }, credits: 0, matched: true };
  },
});

const findInvestor = def({
  name: "find_investor",
  title: "Find investor",
  description: "Resolve an investor (fund, CVC, angel) from its domain or name to an investor id (free).",
  input: z.object({ domain: z.string().max(200).optional(), name: z.string().max(200).optional() }),
  paid: false,
  async run(_p, i) {
    const [r] = await repo.resolveInvestors([{ domain: i.domain, name: i.name }]);
    if (!r?.investor_id) return miss("investor");
    const x = await repo.getInvestor(r.investor_id);
    return { markdown: `**${str(x?.name)}** (\`${r.investor_id}\`) · ${str(x?.type)} · ${str(x?.hq_country)} — match confidence ${r.confidence}`, data: { investor_id: r.investor_id, name: x?.name, confidence: r.confidence }, credits: 0, matched: true };
  },
});

const search = def({
  name: "search",
  title: "Search",
  description: "Plain-English search across companies, people, investors, funding rounds, talent signals, news signals, acquisitions or IPOs (e.g. \"Series A fintech in Brazil growing headcount\"). Returns a compact ranked list.",
  input: z.object({ query: z.string().min(2).max(500), product: z.enum(PRODUCTS).optional().describe("Force a product; inferred when omitted."), ...pageInput }),
  paid: true,
  async run(p, i) {
    const nl = await nlToQuery(i.query, i.product);
    const offset = Number(i.cursor ? JSON.parse(Buffer.from(i.cursor, "base64url").toString("utf8")).o ?? 0 : 0) || 0;
    const res = await repo.searchEntities(nl.product, { filter: nl.filter, sort: nl.sort, limit: i.limit, offset, orgId: p.orgId });
    const rows = res.rows.map((r) => redistributable(r));
    const next = offset + rows.length < res.total ? Buffer.from(JSON.stringify({ o: offset + rows.length })).toString("base64url") : null;
    const cols = PRODUCT_COLS[nl.product] ?? COMPANY_COLS;
    return {
      markdown: cap(`### ${nl.explanation}\n${num(res.total)}${res.totalCapped ? "+" : ""} matches.\n\n${table(rows, cols)}`, next),
      data: { product: nl.product, filter: nl.filter, explanation: nl.explanation, total: res.total, items: rows, next_cursor: next },
      credits: (offset === 0 ? CREDIT_PRICES["ai_search.query"] : 0) + pageCost(rows.length),
      matched: true,
    };
  },
});

/* ======================= Company intelligence (10) ======================= */

const companyId = { company_id: id("Company") };
async function company(idv: string) {
  return repo.getCompany(idv);
}

const getCompanyProfile = def({
  name: "get_company_profile",
  title: "Company profile",
  description: "Company profile in memo format: what it does, stage, HQ, headcount and growth, funding, founders, investors, highlights.",
  input: z.object(companyId),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const [people, investors] = await Promise.all([repo.getCompanyPeople(i.company_id, 20), repo.getCompanyInvestors(i.company_id)]);
    const j = companyJson(c, { founders: people.filter((x) => x.is_founder), investors }) as Row;
    const founders = people.filter((x) => x.is_founder).slice(0, 5);
    const md = [
      `## ${str(c.name)} (\`${str(c.id)}\`)`,
      str(c.tagline || c.description),
      "",
      `- **Stage:** ${str(c.growth_stage)} · **HQ:** ${[c.hq_city, c.hq_country].filter(Boolean).map(str).join(", ")} · **Founded:** ${str(c.founded_year)}`,
      `- **Employees:** ${num(c.employee_count)} (${pct(c.headcount_growth_3m)} 3 mo, ${pct(c.headcount_growth_12m)} 12 mo)`,
      `- **Funding:** ${usd(c.total_funding_usd)} total · last ${str(c.last_funding_type)} ${usd(c.last_funding_usd)} on ${day(c.last_funding_date)}`,
      `- **Estimated revenue:** ${usd(c.est_revenue_usd)} · **valuation:** ${usd(c.est_valuation_usd)} (model estimates)`,
      `- **Founders:** ${founders.map((f) => `${str(f.full_name)} (\`${str(f.id)}\`)`).join(", ") || "—"}`,
      `- **Investors:** ${investors.slice(0, 6).map((x) => `${str(x.name)}${x.is_lead ? " (lead)" : ""}`).join(", ") || "—"}`,
      `- **Highlights:** ${str(c.highlights) || "—"}`,
      `- **Website:** ${str(c.domain)} · **Rank:** ${num(c.rank)}`,
    ].join("\n");
    return { markdown: cap(md), data: j, credits: BY_ID, matched: true };
  },
});

const getCompanyCompetitors = def({
  name: "get_company_competitors",
  title: "Company competitors",
  description: "Similar companies and competitors with an overlap score (0–10) and the reason they overlap.",
  input: z.object({ ...companyId, min_overlap: z.number().min(0).max(10).optional(), ...pageInput }),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const rows = await repo.getCompanyCompetitors(i.company_id, 50, i.min_overlap ?? 0);
    return pageOut(`Competitors of ${str(c.name)}`, rows, i, [...COMPANY_COLS.slice(0, 4), ["overlap_score", "Overlap", (r) => `${str(r.overlap_score)}/10`], ["reason", "Why", (r) => str(r.reason).slice(0, 120)]]);
  },
});

const getCompanyFunding = def({
  name: "get_company_funding",
  title: "Company funding",
  description: "Funding rounds (type, amount, date, post-money, investors) and the company's investors.",
  input: z.object({ ...companyId, ...pageInput }),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const rounds = await repo.getCompanyRounds(i.company_id);
    return pageOut(`Funding rounds of ${str(c.name)} — ${usd(c.total_funding_usd)} total`, rounds, i, [["type", "Round", (r) => `${str(r.type)} (\`${str(r.id)}\`)`], ["amount_usd", "Amount", (r) => usd(r.amount_usd)], ["announced_date", "Date", (r) => day(r.announced_date)], ["post_money_usd", "Post-money", (r) => usd(r.post_money_usd)], ["investors", "Investors", (r) => (Array.isArray(r.investors) ? (r.investors as Row[]).map((x) => str(x.name ?? x)).join(", ") : str(r.investors))]]);
  },
});

async function estimates(companyIdv: string) {
  const [est, disc] = await Promise.all([repo.getCompanyEstimates(companyIdv), repo.getCompanyDisclosures(companyIdv)]);
  return { est, disc, latest: est[est.length - 1], yearAgo: est[est.length - 13] };
}

const getCompanyRevenue = def({
  name: "get_company_revenue",
  title: "Company revenue",
  description: "Latest estimated revenue (P10/P50/P90, confidence, model version, drivers), 12-month growth, and verified reported revenue.",
  input: z.object(companyId),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const { disc, latest, yearAgo } = await estimates(i.company_id);
    if (!latest) return { markdown: `No revenue estimate for ${str(c.name)} yet.`, data: { company_id: i.company_id, estimate: null, disclosures: disc }, credits: 0, matched: false };
    const growth = yearAgo && Number(yearAgo.revenue_p50) > 0 ? Number(latest.revenue_p50) / Number(yearAgo.revenue_p50) - 1 : null;
    const md = [`### Revenue — ${str(c.name)}`, `- Estimated (${day(latest.month).slice(0, 7)}): **${usd(latest.revenue_p50)}** (P10 ${usd(latest.revenue_p10)} – P90 ${usd(latest.revenue_p90)}), ${str(latest.confidence)} confidence, model ${str(latest.model_version)}`, `- 12-month growth (estimate): ${pct(growth)}`, ...disc.slice(-3).map((d) => `- Reported ${str(d.type)} for ${day(d.period)}: ${usd(d.amount_usd)}${d.publisher ? ` (${str(d.publisher)})` : ""}`), "", "_Estimates are model outputs, not reported figures._"].join("\n");
    return { markdown: md, data: { company_id: i.company_id, estimate: latest, revenue_growth_12m: growth, disclosures: disc }, credits: ESTIMATE, matched: true };
  },
});

const getCompanyValuation = def({
  name: "get_company_valuation",
  title: "Company valuation",
  description: "Estimated valuation (P10/P50/P90) with the main drivers, plus last post-money valuation.",
  input: z.object(companyId),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const { latest } = await estimates(i.company_id);
    if (!latest) return { markdown: `No valuation estimate for ${str(c.name)} yet.`, data: { company_id: i.company_id, estimate: null }, credits: 0, matched: false };
    const drivers = (Array.isArray(latest.drivers) ? (latest.drivers as Row[]) : []).slice(0, 5);
    const md = [`### Valuation — ${str(c.name)}`, `- Estimated: **${usd(latest.valuation_p50)}** (P10 ${usd(latest.valuation_p10)} – P90 ${usd(latest.valuation_p90)}), model ${str(latest.model_version)}`, `- Last post-money: ${usd(c.post_money_valuation_usd)}`, drivers.length ? `- Drivers: ${drivers.map((d) => str(d.label ?? d.feature ?? d.name)).join(", ")}` : ""].filter(Boolean).join("\n");
    return { markdown: md, data: { company_id: i.company_id, valuation_p10: latest.valuation_p10, valuation_p50: latest.valuation_p50, valuation_p90: latest.valuation_p90, drivers, post_money_valuation_usd: c.post_money_valuation_usd }, credits: ESTIMATE, matched: true };
  },
});

const getCompanyNews = def({
  name: "get_company_news",
  title: "Company news",
  description: "Scored news signals for a company (category, 0–5 score, summary, publisher, date).",
  input: z.object({ ...companyId, ...pageInput }),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const rows = await repo.getCompanyNews(i.company_id, 200);
    return pageOut(`News — ${str(c.name)}`, rows, i, [["published_at", "Date", (r) => day(r.published_at)], ["title", "Headline", (r) => str(r.title)], ["category", "Category", (r) => str(r.category)], ["score", "Score", (r) => str(r.score)]]);
  },
});

const getCompanyInvestorInterest = def({
  name: "get_company_investor_interest",
  title: "Investor interest in a company",
  description: "Which investors are showing interest in a company, from public evidence (score 1–10). Needs the interest-signals feature on the workspace.",
  input: z.object({ ...companyId, ...pageInput }),
  paid: false,
  async run(p, i) {
    const rows = await repo.interestFor(p, { companyId: i.company_id });
    if (!rows) return R3("Investor-interest signals");
    return pageOut("Investor interest", rows as Row[], i, [["signal_date", "Date", (r) => day(r.signal_date)], ["target_name", "Company", (r) => `${str(r.target_name)} (\`${str(r.target_company_id)}\`)`], ["investor_name", "Investor", (r) => str(r.investor_name ?? `${str(r.investor_type)} investor`)], ["score", "Score", (r) => `${str(r.score)}/10`], ["source_type", "Evidence", (r) => str(r.source_type).toLowerCase().replace("_", " ")]]);
  },
});

const getCompanyPeople = def({
  name: "get_company_people",
  title: "Company people",
  description: "Key people and team members (founders first), with title and seniority.",
  input: z.object({ ...companyId, ...pageInput }),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const rows = await repo.getCompanyPeople(i.company_id, 500);
    return pageOut(`People — ${str(c.name)}`, rows, i, [["full_name", "Name", (r) => `${str(r.full_name)} (\`${str(r.id)}\`)`], ["current_title", "Title", (r) => str(r.current_title)], ["is_founder", "Founder", (r) => (r.is_founder ? "yes" : "")], ["seniority", "Seniority", (r) => str(r.seniority)]]);
  },
});

const getCompanyTraction = def({
  name: "get_company_traction",
  title: "Company traction",
  description: "Traction metrics over time: employees, web visits, LinkedIn and Twitter followers (latest, 1/3/6/12-month change).",
  input: z.object(companyId),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const metrics = await repo.getCompanyMetrics(i.company_id);
    const by = new Map<string, { date: string; value: number }[]>();
    for (const m of metrics) by.set(m.metric, [...(by.get(m.metric) ?? []), { date: m.date, value: Number(m.value) }]);
    const summary: Row[] = [...by.entries()].map(([metric, pts]) => {
      const last = pts[pts.length - 1]!;
      const at = (months: number) => pts.filter((p) => new Date(p.date).getTime() <= new Date(last.date).getTime() - months * 30 * 864e5).pop();
      const ch = (m: number) => { const b = at(m); return b && b.value ? last.value / b.value - 1 : null; };
      return { metric, latest: last.value, date: last.date, change_1m: ch(1), change_3m: ch(3), change_6m: ch(6), change_12m: ch(12) };
    });
    if (!summary.length) return { markdown: `No traction series for ${str(c.name)} yet.`, data: { company_id: i.company_id, metrics: [] }, credits: 0, matched: false };
    return { markdown: `### Traction — ${str(c.name)}\n\n${table(summary, [["metric", "Metric", (r) => str(r.metric)], ["latest", "Latest", (r) => num(r.latest)], ["change_1m", "1 mo", (r) => pct(r.change_1m)], ["change_3m", "3 mo", (r) => pct(r.change_3m)], ["change_12m", "12 mo", (r) => pct(r.change_12m)]])}`, data: { company_id: i.company_id, metrics: summary }, credits: ESTIMATE, matched: true };
  },
});

const getCompanyTransactions = def({
  name: "get_company_transactions",
  title: "Company M&A and IPO",
  description: "Acquisitions (as acquirer or target) and IPO data for a company.",
  input: z.object(companyId),
  paid: true,
  async run(_p, i) {
    const c = await company(i.company_id);
    if (!c) return miss("company");
    const [acq, ipos] = await Promise.all([repo.getCompanyAcquisitions(i.company_id), repo.getCompanyIpos(i.company_id)]);
    const md = [`### M&A and IPO — ${str(c.name)}`, "", "**Acquisitions**", table(acq.slice(0, 20), PRODUCT_COLS.acquisitions!), "", "**IPO**", ipos.length ? table(ipos, [["exchange", "Exchange", (r) => str(r.exchange)], ["ticker", "Ticker", (r) => str(r.ticker)], ["date", "Date", (r) => day(r.date)], ["valuation_usd", "Valuation", (r) => usd(r.valuation_usd)], ["raised_usd", "Raised", (r) => usd(r.raised_usd)]]) : "_None._"].join("\n");
    const found = acq.length + ipos.length > 0;
    return { markdown: cap(md), data: { company_id: i.company_id, acquisitions: acq.map((r) => redistributable(r)), ipos: ipos.map((r) => redistributable(r)) }, credits: found ? BY_ID : 0, matched: found };
  },
});

/* ======================= People (3) ======================= */

const personId = { person_id: id("Person") };

const getPersonProfile = def({
  name: "get_person_profile",
  title: "Person profile",
  description: "Person profile: current role, career history, education, highlights.",
  input: z.object(personId),
  paid: true,
  async run(_p, i) {
    const x = await repo.getPerson(i.person_id);
    if (!x) return miss("person");
    const [exp, edu] = await Promise.all([repo.getPersonExperience(i.person_id), repo.getPersonEducation(i.person_id)]);
    const md = [`## ${str(x.full_name)} (\`${str(x.id)}\`)`, `${str(x.current_title)} at ${str(x.current_company_name)} · ${str(x.location)}`, `- Highlights: ${str(x.highlights) || "—"}`, "", "**Career**", ...exp.slice(0, 8).map((e) => `- ${str(e.title)}, ${str(e.company_name)} (${day(e.start).slice(0, 7)} – ${e.is_current ? "present" : day(e.end).slice(0, 7)})`), "", "**Education**", ...edu.slice(0, 4).map((e) => `- ${str(e.school_name)}${e.degree ? `, ${str(e.degree)}` : ""}`)].join("\n");
    return { markdown: cap(md), data: { ...(personJson(x) as Row), experience: exp.slice(0, 15), education: edu }, credits: BY_ID, matched: true };
  },
});

const getPersonEmail = def({
  name: "get_person_email",
  title: "Person email",
  description: `Verified email(s) for a person. Costs ${CREDIT_PRICES["person.email"]} credits, charged only when an email is returned; every reveal is logged.`,
  input: z.object(personId),
  paid: true,
  async run(p, i) {
    const x = await repo.getPerson(i.person_id);
    if (!x) return miss("person");
    const emails = (await repo.getPersonEmails(i.person_id)).filter((e) => e.status === "verified");
    if (!emails.length) return { markdown: `No verified email for ${str(x.full_name)}. Not charged.`, data: { person_id: i.person_id, emails: [] }, credits: 0, matched: false };
    await repo.audit(p, "person.email_reveal.mcp", i.person_id);
    return { markdown: `${str(x.full_name)}: ${emails.map((e) => `${e.email} (${e.type})`).join(", ")}`, data: { person_id: i.person_id, emails }, credits: CREDIT_PRICES["person.email"], matched: true };
  },
});

const getPersonTalentSignals = def({
  name: "get_person_talent_signals",
  title: "Person talent signals",
  description: "Talent signals for a person (new company, new role, promotion, departure, out of stealth), optionally since a date.",
  input: z.object({ ...personId, since: z.string().date().optional().describe("YYYY-MM-DD"), ...pageInput }),
  paid: true,
  async run(_p, i) {
    const x = await repo.getPerson(i.person_id);
    if (!x) return miss("person");
    const rows = (await repo.getPersonTalentSignals(i.person_id)).filter((s) => !i.since || String(s.signal_date) >= i.since);
    return pageOut(`Talent signals — ${str(x.full_name)}`, rows, i, [["signal_date", "Date", (r) => day(r.signal_date)], ["type", "Signal", (r) => str(r.type)], ["score", "Score", (r) => str(r.score)], ["summary", "Summary", (r) => str(r.summary)]]);
  },
});

/* ======================= Investors (3) ======================= */

const investorId = { investor_id: id("Investor") };

const getInvestorProfile = def({
  name: "get_investor_profile",
  title: "Investor profile",
  description: "Investor profile: type, AUM, check size, stages, geographies, activity, stage mix, recent portfolio.",
  input: z.object(investorId),
  paid: true,
  async run(_p, i) {
    const v = await repo.getInvestor(i.investor_id);
    if (!v) return miss("investor");
    const [mix, port] = await Promise.all([repo.getInvestorStageMix(i.investor_id), repo.getInvestorPortfolio(i.investor_id, 10)]);
    const md = [`## ${str(v.name)} (\`${str(v.id)}\`)`, `${str(v.type)} · ${str(v.hq_country)}`, `- AUM ${usd(v.aum_usd)} · checks ${usd(v.check_min)}–${usd(v.check_max)}`, `- ${num(v.investments_count)} investments, ${num(v.leads_count)} leads, ${num(v.exits_count)} exits`, `- Stage mix: ${mix.slice(0, 6).map((m) => `${m.type} ${m.n}`).join(", ")}`, `- Stages: ${str(v.target_stages)} · Geographies: ${str(v.geographies)}`, "", "**Recent portfolio**", ...port.map((c) => `- ${str(c.name)} (\`${str(c.id)}\`) · ${str(c.growth_stage)} · ${day(c.first_invested)}${c.is_lead ? " · lead" : ""}`)].join("\n");
    return { markdown: cap(md), data: { ...(investorJson(v) as Row), stage_mix: mix, recent_portfolio: port }, credits: BY_ID, matched: true };
  },
});

const getInvestorRounds = def({
  name: "get_investor_rounds",
  title: "Investor rounds",
  description: "Rounds an investor took part in (lead or not), with co-investors.",
  input: z.object({ ...investorId, ...pageInput }),
  paid: true,
  async run(_p, i) {
    const v = await repo.getInvestor(i.investor_id);
    if (!v) return miss("investor");
    const [rounds, co] = await Promise.all([repo.getInvestorRounds(i.investor_id, 500), repo.getCoInvestors(i.investor_id, 10)]);
    const out = pageOut(`Rounds — ${str(v.name)}`, rounds, i, [["company_name", "Company", (r) => `${str(r.company_name)} (\`${str(r.company_id)}\`)`], ["type", "Round", (r) => str(r.type)], ["amount_usd", "Amount", (r) => usd(r.amount_usd)], ["announced_date", "Date", (r) => day(r.announced_date)], ["investor_is_lead", "Lead", (r) => (r.investor_is_lead ? "yes" : "")]], undefined, { co_investors: co });
    return { ...out, markdown: cap(`${out.markdown}\n\n**Top co-investors:** ${co.map((c) => `${str(c.name)} (${num(c.shared_rounds)})`).join(", ")}`) };
  },
});

const getInvestorInterestSignals = def({
  name: "get_investor_interest_signals",
  title: "Investor interest signals",
  description: "Companies an investor is publicly showing interest in (score 1–10). Needs the interest-signals feature on the workspace.",
  input: z.object({ ...investorId, ...pageInput }),
  paid: false,
  async run(p, i) {
    const rows = await repo.interestFor(p, { investorId: i.investor_id });
    if (!rows) return R3("Investor-interest signals");
    return pageOut("Interest signals", rows as Row[], i, [["signal_date", "Date", (r) => day(r.signal_date)], ["target_name", "Company", (r) => `${str(r.target_name)} (\`${str(r.target_company_id)}\`)`], ["investor_name", "Investor", (r) => str(r.investor_name ?? `${str(r.investor_type)} investor`)], ["score", "Score", (r) => `${str(r.score)}/10`], ["source_type", "Evidence", (r) => str(r.source_type).toLowerCase().replace("_", " ")]]);
  },
});

/* ======================= Lists (5) ======================= */

const ENTITY: Record<string, repo.EntityType> = { companies: "COMPANY", people: "PERSON", investors: "INVESTOR" };

const getLists = def({
  name: "get_lists",
  title: "Lists",
  description: "The workspace's lists (including My CRM and My Network) with type and size (free).",
  input: z.object({ type: z.enum(["companies", "people", "investors"]).optional() }),
  paid: false,
  async run(p, i) {
    const lists = await repo.getLists(p, i.type ? ENTITY[i.type] : undefined);
    return { markdown: table(lists as unknown as Row[], [["name", "List", (r) => `${str(r.name)} (\`${str(r.id)}\`)`], ["entity_type", "Type", (r) => str(r.entity_type)], ["item_count", "Items", (r) => num(r.item_count)], ["visibility", "Visibility", (r) => str(r.visibility)]]), data: { items: lists }, credits: 0, matched: true };
  },
});

const getListItems = def({
  name: "get_list_items",
  title: "List items",
  description: "Records in a list with their key fields.",
  input: z.object({ list_id: id("List"), ...pageInput }),
  paid: true,
  async run(p, i) {
    const r = await repo.getListItems(p, i.list_id, { limit: 1000 });
    const product = r.list.entity_type === "COMPANY" ? "companies" : r.list.entity_type === "PERSON" ? "people" : "investors";
    return pageOut(`${r.list.name}`, r.rows, i, PRODUCT_COLS[product as Product]!, CREDIT_PRICES["saved_results.per_100"], { list: { id: r.list.id, name: r.list.name, type: r.list.entity_type } });
  },
});

const createList = def({
  name: "create_list",
  title: "Create list",
  description: "Create a list in the workspace, optionally with records. Changes workspace data.",
  input: z.object({ name: z.string().min(1).max(120), type: z.enum(["companies", "people", "investors"]), entity_ids: z.array(z.string().max(64)).max(500).default([]) }),
  paid: false,
  write: true,
  async run(p, i) {
    const l = await repo.createList(p, { name: i.name, entityType: ENTITY[i.type]! });
    const added = i.entity_ids.length ? await repo.addToList(p, l.id, i.entity_ids) : 0;
    return { markdown: `Created list **${l.name}** (\`${l.id}\`) with ${added} record(s).`, data: { list_id: l.id, added }, credits: 0, matched: true };
  },
});

const addToList = def({
  name: "add_to_list",
  title: "Add to list",
  description: "Add records (ids of the list's type) to a list. Changes workspace data.",
  input: z.object({ list_id: id("List"), entity_ids: z.array(z.string().max(64)).min(1).max(500) }),
  paid: false,
  write: true,
  async run(p, i) {
    const added = await repo.addToList(p, i.list_id, i.entity_ids);
    return { markdown: `Added ${added} record(s) to \`${i.list_id}\`.`, data: { list_id: i.list_id, added }, credits: 0, matched: true };
  },
});

const removeFromList = def({
  name: "remove_from_list",
  title: "Remove from list",
  description: "Remove records from a list. Changes workspace data and cannot be undone automatically.",
  input: z.object({ list_id: id("List"), entity_ids: z.array(z.string().max(64)).min(1).max(500) }),
  paid: false,
  write: true,
  destructive: true,
  async run(p, i) {
    const removed = await repo.removeFromList(p, i.list_id, i.entity_ids);
    return { markdown: `Removed ${removed} record(s) from \`${i.list_id}\`.`, data: { list_id: i.list_id, removed }, credits: 0, matched: true };
  },
});

/* ======================= Saved searches (4) ======================= */

const getSavedSearches = def({
  name: "get_saved_searches",
  title: "Saved searches",
  description: "The workspace's saved searches with new-result counts and alert cadence (free).",
  input: z.object({}),
  paid: false,
  async run(p) {
    const s = await repo.getSavedSearches(p);
    return { markdown: table(s as unknown as Row[], [["name", "Search", (r) => `${str(r.name)} (\`${str(r.id)}\`)`], ["product", "Product", (r) => str(r.product)], ["new_results", "New", (r) => num(r.new_results)], ["total_results", "Total", (r) => num(r.total_results)], ["alert_cadence", "Alerts", (r) => str(r.alert_cadence)]]), data: { items: s.map((x) => ({ id: x.id, name: x.name, product: x.product, nl_query: x.nl_query, new_results: x.new_results, total_results: x.total_results, alert_cadence: x.alert_cadence })) }, credits: 0, matched: true };
  },
});

const getSavedSearchItems = def({
  name: "get_saved_search_items",
  title: "Saved search results",
  description: "Results of a saved search; `since_last_read: true` returns only results new since you last read it (and marks them read).",
  input: z.object({ search_id: id("Saved search"), since_last_read: z.boolean().default(false), ...pageInput }),
  paid: true,
  async run(p, i) {
    const offset = i.cursor ? Number(JSON.parse(Buffer.from(i.cursor, "base64url").toString("utf8")).o ?? 0) || 0 : 0;
    const readerId = `mcp:${p.userId}`;
    const r = await repo.getSavedSearchResults(p, i.search_id, { newOnly: i.since_last_read, limit: i.limit, offset, readerId });
    if (i.since_last_read) await repo.markSearchRead(p, i.search_id, readerId);
    const rows = r.rows.map((x) => redistributable(x));
    const next = offset + rows.length < r.total ? Buffer.from(JSON.stringify({ o: offset + rows.length })).toString("base64url") : null;
    return {
      markdown: cap(`### ${r.search.name}${i.since_last_read ? " — new since last read" : ""}\n${num(r.total)} result(s).\n\n${table(rows, PRODUCT_COLS[r.search.product] ?? COMPANY_COLS)}`, next),
      data: { search: { id: r.search.id, name: r.search.name, product: r.search.product }, total: r.total, items: rows, next_cursor: next },
      credits: pageCost(rows.length, CREDIT_PRICES["saved_results.per_100"]),
      matched: rows.length > 0,
    };
  },
});

const cadence = z.enum(["OFF", "REALTIME", "DAILY", "WEEKLY"]);

const createSavedSearch = def({
  name: "create_saved_search",
  title: "Create saved search",
  description: "Save a plain-English search with alerts (OFF, REALTIME, DAILY, WEEKLY). Changes workspace data.",
  input: z.object({ name: z.string().min(1).max(120), query: z.string().min(2).max(500), product: z.enum(PRODUCTS).optional(), alert_cadence: cadence.default("DAILY") }),
  paid: false,
  write: true,
  async run(p, i) {
    const nl = await nlToQuery(i.query, i.product);
    await repo.createSavedSearch(p, { name: i.name, product: nl.product, filter: nl.filter, nlQuery: i.query, sort: nl.sort, alertCadence: i.alert_cadence });
    const s = (await repo.getSavedSearches(p)).find((x) => x.name === i.name.slice(0, 120) && x.owner_id === p.userId);
    return { markdown: `Saved **${i.name}** (${nl.explanation}) with ${i.alert_cadence.toLowerCase()} alerts${s ? ` — \`${s.id}\`, ${num(s.total_results)} result(s) now` : ""}.`, data: { search_id: s?.id ?? null, product: nl.product, filter: nl.filter }, credits: 0, matched: true };
  },
});

const updateSavedSearch = def({
  name: "update_saved_search",
  title: "Update saved search",
  description: "Rename a saved search, change its query, or change its alert cadence. Changes workspace data.",
  input: z.object({ search_id: id("Saved search"), name: z.string().min(1).max(120).optional(), query: z.string().min(2).max(500).optional(), alert_cadence: cadence.optional() }),
  paid: false,
  write: true,
  async run(p, i) {
    const s = await repo.getSavedSearch(p, i.search_id);
    const filter = i.query ? (await nlToQuery(i.query, s.product)).filter : undefined;
    const u = await repo.updateSavedSearch(p, i.search_id, { name: i.name, filter, alertCadence: i.alert_cadence });
    return { markdown: `Updated **${u.name}** (\`${u.id}\`): alerts ${str(u.alert_cadence).toLowerCase()}.`, data: { search_id: u.id, name: u.name, alert_cadence: u.alert_cadence }, credits: 0, matched: true };
  },
});

/* ======================= registry ======================= */

export const TOOLS: McpTool[] = [
  findCompany, findPerson, findInvestor, search,
  getCompanyProfile, getCompanyCompetitors, getCompanyFunding, getCompanyRevenue, getCompanyValuation, getCompanyNews, getCompanyInvestorInterest, getCompanyPeople, getCompanyTraction, getCompanyTransactions,
  getPersonProfile, getPersonEmail, getPersonTalentSignals,
  getInvestorProfile, getInvestorRounds, getInvestorInterestSignals,
  getLists, getListItems, createList, addToList, removeFromList,
  getSavedSearches, getSavedSearchItems, createSavedSearch, updateSavedSearch,
] as unknown as McpTool[];
