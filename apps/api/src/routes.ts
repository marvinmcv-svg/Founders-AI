/**
 * R1 API endpoints (plan Phase 5a) + the R2 ones we already have data for (talent, AI search).
 * Numbering in comments follows the Section 11 table.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";
import { API_BULK_MAX } from "@founders/core/limits";
import { CREDIT_PRICES, pageCost } from "@founders/core/pricing";
import { PRODUCTS, emptyFilter, groupSchema, type Product } from "@founders/core/filters";
import { nlToQuery } from "@founders/core/nl";
import { TAXONOMY, BUSINESS_MODELS, GROWTH_STAGES, CUSTOMER_FOCUS, INVESTOR_TYPES, ROUND_TYPES } from "@founders/core/taxonomy";
import * as repo from "@founders/core/repo";
import { ApiError, bill, decodeCursor, endpoint, nextCursor, orgCtx, pageQuery, preflight, requireScope, type Ctx } from "./kit";
import { companyJson, investorJson, personJson, redistributable } from "./serialize";

const json = (c: Ctx, body: unknown, status = 200) => c.json(body as object, status as 200);

async function companyOr404(id: string) {
  const c = await repo.getCompany(id);
  if (!c) throw new ApiError(404, "Not Found", `No company with id ${id}. Misses are not charged.`);
  return c;
}
async function personOr404(id: string) {
  const p = await repo.getPerson(id);
  if (!p) throw new ApiError(404, "Not Found", `No person with id ${id}. Misses are not charged.`);
  return p;
}
async function investorOr404(id: string) {
  const i = await repo.getInvestor(id);
  if (!i) throw new ApiError(404, "Not Found", `No investor with id ${id}. Misses are not charged.`);
  return i;
}

async function fullCompany(id: string) {
  const c = await companyOr404(id);
  const [people, investors] = await Promise.all([repo.getCompanyPeople(id, 20), repo.getCompanyInvestors(id)]);
  return companyJson(c, { founders: people.filter((p) => p.is_founder), investors });
}

/** Page through an in-memory list with cursor semantics and bill per page. */
async function paged(c: Ctx, op: string, all: unknown[], query: Record<string, unknown>, per100: number = CREDIT_PRICES["feed.per_100"]) {
  const offset = decodeCursor(query.cursor as string | undefined);
  const limit = Number(query.limit);
  const items = all.slice(offset, offset + limit);
  await bill(c, op, pageCost(items.length, per100), items.length > 0);
  return json(c, { items, total: all.length, next_cursor: nextCursor(offset, items.length, all.length) });
}

const resolveItem = z.object({ domain: z.string().optional(), name: z.string().optional(), linkedin_url: z.string().optional(), email: z.string().optional() });
const resolveBody = z.object({ items: z.array(resolveItem).min(1).max(API_BULK_MAX) });

/* ============================ Companies ============================ */

endpoint({ method: "get", path: "/companies/:companyId", tag: "Companies", summary: "Full company record", credit: "per_match", handler: async (c, { params }) => {
  const body = await fullCompany(params.companyId!);
  await bill(c, "companies.get", CREDIT_PRICES["entity.by_id"], true);
  return json(c, body);
} });

endpoint({ method: "post", path: "/companies", tag: "Companies", summary: `Bulk enrich up to ${API_BULK_MAX} companies by domain or name`, credit: "per_match", body: resolveBody, handler: async (c, { body }) => {
  const { items } = body as z.infer<typeof resolveBody>;
  await preflight(c, items.length);
  const resolved = await repo.resolveCompanies(items);
  const out = await Promise.all(resolved.map(async (r) => ({ input: r.input, match: r.company_id ? await fullCompany(r.company_id) : null })));
  const matched = out.filter((o) => o.match).length;
  await bill(c, "companies.enrich", matched * CREDIT_PRICES["entity.enrich"], matched > 0);
  return json(c, { items: out, matched });
} });

endpoint({ method: "post", path: "/companies/resolve", tag: "Companies", summary: "Resolve identifiers to company IDs", credit: "free", body: resolveBody, handler: async (c, { body }) => {
  const { items } = body as z.infer<typeof resolveBody>;
  const res = await repo.resolveCompanies(items);
  await bill(c, "companies.resolve", 0, true);
  return json(c, { items: res });
} });

endpoint({ method: "post", path: "/companies/search-by-text", tag: "Companies", summary: "Find a company from incomplete information", credit: "per_page",
  body: z.object({ text: z.string().min(2).max(300), limit: z.number().int().min(1).max(50).default(10) }), handler: async (c, { body }) => {
    const { text, limit } = body as { text: string; limit: number };
    const res = await repo.searchEntities("companies", { q: text, limit });
    await bill(c, "companies.search_by_text", pageCost(res.rows.length), res.rows.length > 0);
    return json(c, { items: res.rows.map((r) => redistributable(r)) });
  } });

const sub = (path: string, summary: string, credit: string, op: string, fetch: (id: string, q: Record<string, unknown>) => Promise<unknown[]>, query = pageQuery) =>
  endpoint({ method: "get", path: `/companies/:companyId/${path}`, tag: "Companies", summary, credit, query, handler: async (c, { params, query: q }) => {
    await companyOr404(params.companyId!);
    return paged(c, op, (await fetch(params.companyId!, q)).map((r) => redistributable(r as repo.Row)), q);
  } });

sub("people", "Key people and team members", "per_page", "companies.people", (id) => repo.getCompanyPeople(id, 500));
sub("competitors", "Similar companies with overlap score 0–10", "per_page", "companies.competitors", (id, q) => repo.getCompanyCompetitors(id, 50, Number(q.min_overlap ?? 0)), pageQuery.extend({ min_overlap: z.coerce.number().min(0).max(10).optional() }));
sub("funding-rounds", "Funding rounds", "per_page", "companies.funding_rounds", (id) => repo.getCompanyRounds(id));
sub("acquisitions", "Acquisitions as acquirer or target", "per_page", "companies.acquisitions", (id) => repo.getCompanyAcquisitions(id));
sub("news-signals", "Scored news history", "per_page", "companies.news", (id) => repo.getCompanyNews(id, 500));

endpoint({ method: "get", path: "/companies/:companyId/ipos", tag: "Companies", summary: "IPO data", credit: "per_match", handler: async (c, { params }) => {
  await companyOr404(params.companyId!);
  const ipos = await repo.getCompanyIpos(params.companyId!);
  await bill(c, "companies.ipos", CREDIT_PRICES["entity.by_id"], ipos.length > 0);
  return json(c, { items: ipos });
} });

async function estimates(id: string) {
  await companyOr404(id);
  const [est, disc] = await Promise.all([repo.getCompanyEstimates(id), repo.getCompanyDisclosures(id)]);
  if (!est.length) throw new ApiError(404, "Not Found", "No estimate for this company yet. Not charged.");
  return { est, disc };
}
const growth = (est: repo.Row[], back: number) => {
  const a = Number(est[est.length - 1]?.revenue_p50);
  const b = Number(est[est.length - 1 - back]?.revenue_p50);
  return b ? Math.round(((a - b) / b) * 1000) / 10 : null;
};

endpoint({ method: "get", path: "/companies/:companyId/latest-revenue", tag: "Estimates", summary: "Latest estimated and reported revenue with growth and range", credit: "2 credits per match", handler: async (c, { params }) => {
  const { est, disc } = await estimates(params.companyId!);
  const last = est[est.length - 1]!;
  const reported = disc[disc.length - 1];
  await bill(c, "companies.latest_revenue", CREDIT_PRICES["estimates.record"], true);
  return json(c, {
    company_id: params.companyId,
    month: last.month,
    est_revenue_usd: last.revenue_p50,
    est_revenue_range_usd: { p10: last.revenue_p10, p90: last.revenue_p90 },
    revenue_type: last.revenue_type,
    confidence: last.confidence,
    latest_revenue_reported_usd: reported?.amount_usd ?? null,
    latest_revenue_reported_period: reported?.period ?? null,
    est_revenue_growth_3m_pct: growth(est, 3),
    est_revenue_growth_6m_pct: growth(est, 6),
    est_revenue_growth_1y_pct: growth(est, 11),
    model_version: last.model_version,
  });
} });

endpoint({ method: "get", path: "/companies/:companyId/latest-valuation", tag: "Estimates", summary: "Valuation estimate with range and drivers", credit: "2 credits per match", handler: async (c, { params }) => {
  const { est } = await estimates(params.companyId!);
  const last = est[est.length - 1]!;
  await bill(c, "companies.latest_valuation", CREDIT_PRICES["estimates.record"], true);
  return json(c, { company_id: params.companyId, month: last.month, valuation_usd: last.valuation_p50, valuation_range_usd: { p10: last.valuation_p10, p90: last.valuation_p90 }, confidence: last.confidence, drivers: last.drivers, model_version: last.model_version });
} });

endpoint({ method: "get", path: "/companies/:companyId/revenue-history", tag: "Estimates", summary: "Monthly P10/P50/P90 revenue with disclosure anchors", credit: "2 credits per match", handler: async (c, { params }) => {
  const { est, disc } = await estimates(params.companyId!);
  await bill(c, "companies.revenue_history", CREDIT_PRICES["estimates.record"], true);
  return json(c, { company_id: params.companyId, months: est.map((e) => ({ month: e.month, p10: e.revenue_p10, p50: e.revenue_p50, p90: e.revenue_p90, confidence: e.confidence })), anchors: disc.map((d) => ({ period: d.period, amount_usd: d.amount_usd, type: d.type, source_url: d.source_url, publisher: d.publisher })) });
} });

endpoint({ method: "get", path: "/companies/:companyId/traction", tag: "Companies", summary: "Monthly traction metrics (employees, web visits, followers)", credit: "2 credits per match", handler: async (c, { params }) => {
  await companyOr404(params.companyId!);
  const m = await repo.getCompanyMetrics(params.companyId!);
  const series: Record<string, { date: string; value: number }[]> = {};
  for (const x of m) (series[x.metric] ??= []).push({ date: x.date, value: x.value });
  await bill(c, "companies.traction", CREDIT_PRICES["estimates.record"], m.length > 0);
  return json(c, { company_id: params.companyId, series });
} });

/* ============================ People ============================ */

endpoint({ method: "get", path: "/people/:personId", tag: "People", summary: "Full person record", credit: "per_match", handler: async (c, { params }) => {
  const p = await personOr404(params.personId!);
  await bill(c, "people.get", CREDIT_PRICES["entity.by_id"], true);
  return json(c, personJson(p));
} });

endpoint({ method: "post", path: "/people", tag: "People", summary: `Bulk enrich up to ${API_BULK_MAX} people by LinkedIn URL, email or name`, credit: "per_match", body: resolveBody, handler: async (c, { body }) => {
  const { items } = body as z.infer<typeof resolveBody>;
  await preflight(c, items.length);
  const resolved = await repo.resolvePeople(items);
  const out = await Promise.all(resolved.map(async (r) => ({ input: r.input, match: r.person_id ? personJson((await repo.getPerson(r.person_id))!) : null })));
  const matched = out.filter((o) => o.match).length;
  await bill(c, "people.enrich", matched * CREDIT_PRICES["entity.enrich"], matched > 0);
  return json(c, { items: out, matched });
} });

endpoint({ method: "post", path: "/people/resolve", tag: "People", summary: "Resolve identifiers to person IDs", credit: "free", body: resolveBody, handler: async (c, { body }) => {
  const res = await repo.resolvePeople((body as z.infer<typeof resolveBody>).items);
  await bill(c, "people.resolve", 0, true);
  return json(c, { items: res });
} });

endpoint({ method: "post", path: "/people/by-email", tag: "People", summary: "Reverse email lookup", credit: "per_match", body: z.object({ email: z.string().email() }), handler: async (c, { body }) => {
  const [r] = await repo.resolvePeople([{ email: (body as { email: string }).email }]);
  if (!r?.person_id) throw new ApiError(404, "Not Found", "No person with that email. Not charged.");
  await bill(c, "people.by_email", CREDIT_PRICES["entity.enrich"], true);
  return json(c, personJson((await repo.getPerson(r.person_id))!));
} });

endpoint({ method: "get", path: "/people/:personId/email", tag: "People", summary: "Verified email(s) — charged only when an email is returned", credit: "5 credits when found", handler: async (c, { params }) => {
  await personOr404(params.personId!);
  const emails = await repo.getPersonEmails(params.personId!);
  if (!emails.length) throw new ApiError(404, "Not Found", "No email on file. Not charged.");
  await preflight(c, CREDIT_PRICES["person.email"]);
  await bill(c, "people.email", CREDIT_PRICES["person.email"], true);
  return json(c, { person_id: params.personId, emails });
} });

endpoint({ method: "get", path: "/people/:personId/talent-signals", tag: "People", summary: "Talent signal history", credit: "per_page", query: pageQuery, handler: async (c, { params, query }) => {
  await personOr404(params.personId!);
  return paged(c, "people.talent_signals", await repo.getPersonTalentSignals(params.personId!), query);
} });

endpoint({ method: "get", path: "/people/:personId/experience", tag: "People", summary: "Career history", credit: "per_match", handler: async (c, { params }) => {
  await personOr404(params.personId!);
  const [experience, education] = await Promise.all([repo.getPersonExperience(params.personId!), repo.getPersonEducation(params.personId!)]);
  await bill(c, "people.experience", CREDIT_PRICES["entity.by_id"], true);
  return json(c, { person_id: params.personId, experience, education });
} });

endpoint({ method: "get", path: "/people/:personId/investments", tag: "People", summary: "Angel investments", credit: "per_page", query: pageQuery, handler: async (c, { params, query }) => {
  await personOr404(params.personId!);
  return paged(c, "people.investments", await repo.getPersonInvestments(params.personId!), query);
} });

/* ============================ Investors ============================ */

endpoint({ method: "get", path: "/investors/:investorId", tag: "Investors", summary: "Investor profile", credit: "per_match", handler: async (c, { params }) => {
  const i = await investorOr404(params.investorId!);
  await bill(c, "investors.get", CREDIT_PRICES["entity.by_id"], true);
  return json(c, investorJson(i));
} });

endpoint({ method: "post", path: "/investors/resolve", tag: "Investors", summary: `Resolve up to ${API_BULK_MAX} identifiers to investor IDs`, credit: "free", body: resolveBody, handler: async (c, { body }) => {
  const res = await repo.resolveInvestors((body as z.infer<typeof resolveBody>).items);
  await bill(c, "investors.resolve", 0, true);
  return json(c, { items: res });
} });

const invSub = (path: string, summary: string, op: string, fetch: (id: string) => Promise<unknown[]>) =>
  endpoint({ method: "get", path: `/investors/:investorId/${path}`, tag: "Investors", summary, credit: "per_page", query: pageQuery, handler: async (c, { params, query }) => {
    await investorOr404(params.investorId!);
    return paged(c, op, await fetch(params.investorId!), query);
  } });
invSub("portfolio", "Portfolio companies", "investors.portfolio", (id) => repo.getInvestorPortfolio(id, 5000));
invSub("funding-rounds", "Rounds with co-investors", "investors.funding_rounds", (id) => repo.getInvestorRounds(id, 5000));
invSub("co-investors", "Co-investor graph", "investors.co_investors", (id) => repo.getCoInvestors(id, 200));

/* ============================ Transactions & signals feeds ============================ */

const feed = (path: string, tag: string, summary: string, product: Product, dateField: string, extra: z.ZodRawShape = {}) =>
  endpoint({
    method: "get",
    path,
    tag,
    summary,
    credit: "per_page",
    query: pageQuery.extend({ [`${dateField}_after`]: z.string().date().optional().describe(`Only records with ${dateField} after this date (YYYY-MM-DD).`), ...extra }),
    handler: async (c, { query }) => {
      const offset = decodeCursor(query.cursor as string | undefined);
      const children: repo.Row[] = [];
      const after = query[`${dateField}_after`];
      if (after) children.push({ kind: "condition", field: dateField, operator: "after", value: after });
      if (query.type) children.push({ kind: "condition", field: "type", operator: "any_of", value: String(query.type).split(",") });
      if (query.min_score) children.push({ kind: "condition", field: "score", operator: "gte", value: Number(query.min_score) });
      const filter = groupSchema.parse({ kind: "group", op: "AND", children });
      const res = await repo.searchEntities(product, { filter, limit: Number(query.limit), offset });
      await bill(c, `${product}.feed`, pageCost(res.rows.length), res.rows.length > 0);
      return json(c, { items: res.rows, total: res.total, total_capped: res.totalCapped, next_cursor: nextCursor(offset, res.rows.length, res.total) });
    },
  });

feed("/funding-rounds", "Transactions", "Funding rounds feed", "funding_rounds", "announced_date", { type: z.string().optional().describe("Comma-separated round types, e.g. Seed,Series A") });
feed("/talent", "Signals", "Talent signals feed", "talent_signals", "signal_date", { type: z.string().optional(), min_score: z.coerce.number().min(1).max(10).optional() });

endpoint({ method: "get", path: "/funding-rounds/:roundId", tag: "Transactions", summary: "One funding round", credit: "per_match", handler: async (c, { params }) => {
  const r = await repo.getRound(params.roundId!);
  if (!r) throw new ApiError(404, "Not Found", "No such round. Not charged.");
  await bill(c, "funding_rounds.get", CREDIT_PRICES["entity.by_id"], true);
  return json(c, redistributable(r));
} });

endpoint({ method: "get", path: "/acquisitions", tag: "Transactions", summary: "Acquisitions feed", credit: "per_page", query: pageQuery, handler: async (c, { query }) => {
  const rows = await repo.rawQuery(sqlFeed("acquisitions", "date"));
  return paged(c, "acquisitions.feed", rows, query);
} });
endpoint({ method: "get", path: "/ipos", tag: "Transactions", summary: "IPO feed", credit: "per_page", query: pageQuery, handler: async (c, { query }) => {
  const rows = await repo.rawQuery(sqlFeed("ipos", "date"));
  return paged(c, "ipos.feed", rows, query);
} });

function sqlFeed(table: "acquisitions" | "ipos", col: string) {
  return table === "acquisitions"
    ? sql`SELECT a.*, t.name AS target_name FROM acquisitions a JOIN companies t ON t.id = a.target_id ORDER BY ${sql.raw(`a.${col}`)} DESC LIMIT 5000`
    : sql`SELECT i.*, c.name AS company_name FROM ipos i JOIN companies c ON c.id = i.company_id ORDER BY ${sql.raw(`i.${col}`)} DESC LIMIT 5000`;
}

endpoint({ method: "get", path: "/talent/:signalId", tag: "Signals", summary: "One talent signal", credit: "per_match", handler: async (c, { params }) => {
  const [r] = await repo.rawQuery(sql`SELECT * FROM talent_signals WHERE id = ${params.signalId}`);
  if (!r) throw new ApiError(404, "Not Found", "No such signal. Not charged.");
  await bill(c, "talent.get", CREDIT_PRICES["entity.by_id"], true);
  return json(c, r);
} });

/* ============================ Search & taxonomy ============================ */

const queryCache = new Map<string, { product: Product; filter: unknown; sort: unknown; orgId: string; explanation: string }>();

endpoint({ method: "post", path: "/search", tag: "Search", summary: "Plain-English search across products → query_id + first page", credit: "5 credits + page cost",
  body: z.object({ query: z.string().min(2).max(1000), product: z.enum(PRODUCTS).optional(), limit: z.number().int().min(1).max(1000).default(25) }), handler: async (c, { body }) => {
    const b = body as { query: string; product?: Product; limit: number };
    await preflight(c, CREDIT_PRICES["ai_search.query"] + pageCost(b.limit));
    const nl = await nlToQuery(b.query, b.product);
    const id = `qry_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    queryCache.set(id, { product: nl.product, filter: nl.filter, sort: nl.sort, orgId: c.get("principal").orgId, explanation: nl.explanation });
    const res = await repo.searchEntities(nl.product, { filter: nl.filter, sort: nl.sort, limit: b.limit, orgId: c.get("principal").orgId });
    await bill(c, "search.ai", CREDIT_PRICES["ai_search.query"] + pageCost(res.rows.length), true);
    return json(c, { query_id: id, product: nl.product, filter: nl.filter, explanation: nl.explanation, engine: nl.engine, total: res.total, items: res.rows, next_cursor: nextCursor(0, res.rows.length, res.total) });
  } });

endpoint({ method: "get", path: "/search/:queryId/results", tag: "Search", summary: "Page through an AI search", credit: "per_page", query: pageQuery, handler: async (c, { params, query }) => {
  const q = queryCache.get(params.queryId!);
  if (!q || q.orgId !== c.get("principal").orgId) throw new ApiError(404, "Not Found", "Unknown or expired query_id.");
  const offset = decodeCursor(query.cursor as string | undefined);
  const res = await repo.searchEntities(q.product, { filter: groupSchema.parse(q.filter), limit: Number(query.limit), offset, orgId: q.orgId });
  await bill(c, "search.page", pageCost(res.rows.length), res.rows.length > 0);
  return json(c, { query_id: params.queryId, product: q.product, items: res.rows, total: res.total, next_cursor: nextCursor(offset, res.rows.length, res.total) });
} });

endpoint({ method: "get", path: "/taxonomy", tag: "Search", summary: "Sectors, industries, tech verticals, ecosystems and enums", credit: "free", handler: async (c) => {
  await bill(c, "taxonomy", 0, true);
  return json(c, { ...TAXONOMY, business_models: BUSINESS_MODELS, growth_stages: GROWTH_STAGES, customer_focus: CUSTOMER_FOCUS, investor_types: INVESTOR_TYPES, round_types: ROUND_TYPES });
} });

/* ============================ Saved searches ============================ */

const searchBody = z.object({
  name: z.string().min(1).max(120),
  product: z.enum(PRODUCTS),
  filter: groupSchema.optional(),
  query: z.string().max(1000).optional().describe("Plain-English query; converted to a filter when `filter` is omitted."),
  alert_cadence: z.enum(["OFF", "REALTIME", "DAILY", "WEEKLY"]).optional(),
  visibility: z.enum(["PRIVATE", "TEAM"]).optional(),
});

endpoint({ method: "get", path: "/searches", tag: "Saved searches", summary: "List saved searches", credit: "free", handler: async (c) => {
  const items = await repo.getSavedSearches(orgCtx(c), c.get("principal").keyId);
  await bill(c, "searches.list", 0, true);
  return json(c, { items });
} });

endpoint({ method: "post", path: "/searches", tag: "Saved searches", summary: "Create a saved search (filter AST or plain English)", credit: "free", body: searchBody, handler: async (c, { body }) => {
  requireScope(c, "write:searches");
  const b = body as z.infer<typeof searchBody>;
  const filter = b.filter ?? (b.query ? (await nlToQuery(b.query, b.product)).filter : emptyFilter());
  const s = await repo.createSavedSearch(orgCtx(c), { name: b.name, product: b.product, filter, nlQuery: b.query, alertCadence: b.alert_cadence, visibility: b.visibility });
  await repo.markSearchRead(orgCtx(c), s.id, c.get("principal").keyId);
  await bill(c, "searches.create", 0, true);
  return json(c, s, 201);
} });

endpoint({ method: "get", path: "/searches/:searchId", tag: "Saved searches", summary: "Get a saved search", credit: "free", handler: async (c, { params }) => {
  const s = await repo.getSavedSearch(orgCtx(c), params.searchId!);
  await bill(c, "searches.get", 0, true);
  return json(c, s);
} });

endpoint({ method: "patch", path: "/searches/:searchId", tag: "Saved searches", summary: "Update a saved search", credit: "free", body: searchBody.partial().omit({ product: true }), handler: async (c, { params, body }) => {
  requireScope(c, "write:searches");
  const b = body as Partial<z.infer<typeof searchBody>>;
  const s = await repo.updateSavedSearch(orgCtx(c), params.searchId!, { name: b.name, filter: b.filter, alertCadence: b.alert_cadence, visibility: b.visibility });
  await bill(c, "searches.update", 0, true);
  return json(c, s);
} });

endpoint({ method: "delete", path: "/searches/:searchId", tag: "Saved searches", summary: "Delete a saved search", credit: "free", handler: async (c, { params }) => {
  requireScope(c, "write:searches");
  await repo.deleteSavedSearch(orgCtx(c), params.searchId!);
  await bill(c, "searches.delete", 0, true);
  return json(c, { deleted: true });
} });

const SEARCH_PRODUCTS: Record<string, Product> = { companies: "companies", people: "people", investors: "investors", talent: "talent_signals", transactions: "funding_rounds" };
endpoint({ method: "get", path: "/searches/:product/:searchId/results", tag: "Saved searches", summary: "Saved-search results (`new_since_last_read=true` for a feed)", credit: "per_result",
  query: pageQuery.extend({ new_since_last_read: z.enum(["true", "false"]).optional() }), handler: async (c, { params, query }) => {
    const product = SEARCH_PRODUCTS[params.product!];
    if (!product) throw new ApiError(404, "Not Found", "Product must be companies, people, investors, talent or transactions.");
    const ctx = orgCtx(c);
    const s = await repo.getSavedSearch(ctx, params.searchId!);
    if (s.product !== product) throw new ApiError(400, "Bad Request", `This saved search is for ${s.product}.`);
    const offset = decodeCursor(query.cursor as string | undefined);
    const newOnly = query.new_since_last_read === "true";
    const readerId = c.get("principal").keyId;
    const res = await repo.getSavedSearchResults(ctx, s.id, { newOnly, limit: Number(query.limit), offset, readerId });
    if (newOnly) await repo.markSearchRead(ctx, s.id, readerId);
    await bill(c, "searches.results", pageCost(res.rows.length, CREDIT_PRICES["saved_results.per_100"]), res.rows.length > 0);
    return json(c, { items: res.rows, total: res.total, next_cursor: nextCursor(offset, res.rows.length, res.total) });
  } });

/* ============================ Lists ============================ */

const ENTITY: Record<string, repo.EntityType> = { company: "COMPANY", companies: "COMPANY", people: "PERSON", person: "PERSON", investor: "INVESTOR", investors: "INVESTOR" };

endpoint({ method: "get", path: "/lists", tag: "Lists", summary: "All lists", credit: "free", query: z.object({ type: z.enum(["company", "people", "investor"]).optional() }), handler: async (c, { query }) => {
  const items = await repo.getLists(orgCtx(c), query.type ? ENTITY[String(query.type)] : undefined);
  await bill(c, "lists.list", 0, true);
  return json(c, { items });
} });

endpoint({ method: "post", path: "/lists", tag: "Lists", summary: "Create a list", credit: "free",
  body: z.object({ name: z.string().min(1).max(120), type: z.enum(["company", "people", "investor"]), visibility: z.enum(["PRIVATE", "TEAM"]).optional() }), handler: async (c, { body }) => {
    requireScope(c, "write:lists");
    const b = body as { name: string; type: string; visibility?: "PRIVATE" | "TEAM" };
    const l = await repo.createList(orgCtx(c), { name: b.name, entityType: ENTITY[b.type]!, visibility: b.visibility });
    await bill(c, "lists.create", 0, true);
    return json(c, l, 201);
  } });

endpoint({ method: "get", path: "/lists/:listId", tag: "Lists", summary: "Get list metadata", credit: "free", handler: async (c, { params }) => {
  const l = await repo.getList(orgCtx(c), params.listId!);
  await bill(c, "lists.get", 0, true);
  return json(c, l);
} });

endpoint({ method: "patch", path: "/lists/:listId", tag: "Lists", summary: "Rename or change visibility", credit: "free",
  body: z.object({ name: z.string().min(1).max(120).optional(), visibility: z.enum(["PRIVATE", "TEAM"]).optional() }), handler: async (c, { params, body }) => {
    requireScope(c, "write:lists");
    const l = await repo.updateList(orgCtx(c), params.listId!, body as { name?: string; visibility?: "PRIVATE" | "TEAM" });
    await bill(c, "lists.update", 0, true);
    return json(c, l);
  } });

endpoint({ method: "delete", path: "/lists/:listId", tag: "Lists", summary: "Delete a list", credit: "free", handler: async (c, { params }) => {
  requireScope(c, "write:lists");
  await repo.deleteList(orgCtx(c), params.listId!);
  await bill(c, "lists.delete", 0, true);
  return json(c, { deleted: true });
} });

for (const kind of ["companies", "people", "investors"] as const) {
  endpoint({ method: "get", path: `/lists/${kind}/:listId/results`, tag: "Lists", summary: `List items (${kind})`, credit: "per_result", query: pageQuery, handler: async (c, { params, query }) => {
    const offset = decodeCursor(query.cursor as string | undefined);
    const res = await repo.getListItems(orgCtx(c), params.listId!, { limit: Number(query.limit), offset });
    if (res.list.entity_type !== ENTITY[kind]) throw new ApiError(400, "Bad Request", `This list holds ${res.list.entity_type.toLowerCase()} records.`);
    await bill(c, "lists.results", pageCost(res.rows.length, CREDIT_PRICES["saved_results.per_100"]), res.rows.length > 0);
    return json(c, { items: res.rows, total: res.total, next_cursor: nextCursor(offset, res.rows.length, res.total) });
  } });
  endpoint({ method: "patch", path: `/lists/${kind}/:listId`, tag: "Lists", summary: `Add or remove ${kind}`, credit: "free",
    body: z.object({ add: z.array(z.string()).max(5000).optional(), remove: z.array(z.string()).max(5000).optional() }), handler: async (c, { params, body }) => {
      requireScope(c, "write:lists");
      const b = body as { add?: string[]; remove?: string[] };
      const ctx = orgCtx(c);
      const added = b.add?.length ? await repo.addToList(ctx, params.listId!, b.add) : 0;
      const removed = b.remove?.length ? await repo.removeFromList(ctx, params.listId!, b.remove) : 0;
      await bill(c, "lists.patch", 0, true);
      return json(c, { added, removed });
    } });
}

/* ============================ Account ============================ */

endpoint({ method: "get", path: "/organization/credits", tag: "Account", summary: "Credit balance", credit: "free", handler: async (c) => {
  const balance = await repo.getBalance(c.get("principal").orgId);
  return json(c, { balance });
} });

endpoint({ method: "get", path: "/organization/usage", tag: "Account", summary: "Usage by day, surface and operation", credit: "free", query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }), handler: async (c, { query }) => {
  return json(c, { items: await repo.getUsageByDay(c.get("principal").orgId, Number(query.days)) });
} });

endpoint({ method: "get", path: "/me", tag: "Account", summary: "Key and workspace info", credit: "free", handler: async (c) => {
  const p = c.get("principal");
  const [org] = await repo.rawQuery<{ name: string; plan: string }>(sql`SELECT name, plan FROM organization WHERE id = ${p.orgId}`);
  return json(c, { key_id: p.keyId, scopes: p.scopes, organization: { id: p.orgId, name: org?.name, plan: org?.plan }, credits: await repo.getBalance(p.orgId) });
} });
