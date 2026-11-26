/**
 * Field registry per product. Client-safe (no DB imports): the filter builder UI, NL parser,
 * validator and SQL compiler all read from here. `column` is a whitelisted SQL expression.
 */
import {
  BUSINESS_MODELS,
  COMPANY_HIGHLIGHTS,
  COUNTRIES,
  CUSTOMER_FOCUS,
  EMPLOYEE_RANGES,
  GROWTH_STAGES,
  HIGHLIGHT_LABELS,
  INVESTOR_HIGHLIGHTS,
  INVESTOR_TYPES,
  OPERATING_STATUSES,
  PEOPLE_HIGHLIGHTS,
  REGIONS,
  ROUND_TYPES,
  SENIORITIES,
  DEPARTMENTS,
  TALENT_SIGNAL_TYPES,
  TAXONOMY,
  ACQUISITION_STATUSES,
  IPO_EXCHANGES,
  NEWS_SIGNAL_CATEGORIES,
} from "../taxonomy";
import type { Operator, Product } from "./ast";

export type FieldType = "text" | "enum" | "multi" | "number" | "money" | "percent" | "date" | "boolean" | "list";

export type Option = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  group: string;
  type: FieldType;
  /** Whitelisted SQL expression on the product's base table alias `t`. */
  column: string;
  options?: Option[];
  sortable?: boolean;
  /** Free-text search over this field's options (taxonomy pickers). */
  searchable?: boolean;
  /** When true, values like "1-10" bands etc. are matched case-sensitively as-is. */
  description?: string;
};

const opts = (xs: readonly string[], labels?: Record<string, string>): Option[] =>
  xs.map((x) => ({ value: x, label: labels?.[x] ?? x }));
const nodeOpts = (xs: { id: string; name: string }[]): Option[] => xs.map((x) => ({ value: x.id, label: x.name }));

export const OPERATORS_BY_TYPE: Record<FieldType, Operator[]> = {
  text: ["contains", "is", "is_not", "starts_with", "exists", "not_exists"],
  enum: ["any_of", "none_of", "exists", "not_exists"],
  multi: ["any_of", "all_of", "none_of", "exists", "not_exists"],
  number: ["gte", "lte", "between", "eq", "neq", "exists", "not_exists"],
  money: ["gte", "lte", "between", "exists", "not_exists"],
  percent: ["gte", "lte", "between", "exists", "not_exists"],
  date: ["within_last_days", "after", "before", "exists", "not_exists"],
  boolean: ["is_true", "is_false"],
  list: ["in_list", "not_in_list"],
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: "contains",
  is: "is",
  is_not: "is not",
  starts_with: "starts with",
  any_of: "is any of",
  none_of: "is none of",
  all_of: "includes all of",
  eq: "=",
  neq: "≠",
  gte: "≥",
  lte: "≤",
  between: "between",
  before: "before",
  after: "after",
  within_last_days: "within last",
  is_true: "is true",
  is_false: "is false",
  exists: "is known",
  not_exists: "is unknown",
  in_list: "is in list",
  not_in_list: "is not in list",
};

const companyFields: FieldDef[] = [
  { key: "name", label: "Company name", group: "General", type: "text", column: "t.name", sortable: true },
  { key: "domain", label: "Website domain", group: "General", type: "text", column: "t.domain" },
  { key: "description", label: "Description", group: "General", type: "text", column: "t.description" },
  { key: "operating_status", label: "Operating Status", group: "General", type: "enum", column: "t.operating_status", options: opts(OPERATING_STATUSES) },
  { key: "founded_year", label: "Founded Year", group: "General", type: "number", column: "t.founded_year", sortable: true },
  { key: "bootstrapped", label: "Bootstrapped", group: "General", type: "boolean", column: "t.bootstrapped" },
  { key: "hq_country", label: "HQ Country", group: "Location", type: "enum", column: "t.hq_country", options: opts(COUNTRIES) },
  { key: "hq_region", label: "HQ Region", group: "Location", type: "enum", column: "t.hq_region", options: opts(REGIONS) },
  { key: "hq_city", label: "HQ City", group: "Location", type: "text", column: "t.hq_city" },
  { key: "sector", label: "Sector", group: "Sector", type: "enum", column: "t.sector_id", options: nodeOpts(TAXONOMY.sectors) },
  { key: "industry", label: "Industry", group: "Sector", type: "multi", column: "t.industry_ids", options: nodeOpts(TAXONOMY.industries), searchable: true },
  { key: "tech_vertical", label: "Tech Vertical", group: "Sector", type: "multi", column: "t.tech_vertical_ids", options: nodeOpts(TAXONOMY.verticals), searchable: true },
  { key: "ecosystem", label: "Ecosystem", group: "Ecosystem", type: "multi", column: "t.ecosystem_ids", options: nodeOpts(TAXONOMY.ecosystems) },
  { key: "business_models", label: "Business Models", group: "Sector", type: "multi", column: "t.business_models", options: opts(BUSINESS_MODELS) },
  { key: "customer_focus", label: "Customer Focus", group: "Sector", type: "enum", column: "t.customer_focus", options: opts(CUSTOMER_FOCUS) },
  { key: "growth_stage", label: "Growth Stage", group: "Funding", type: "enum", column: "t.growth_stage", options: opts(GROWTH_STAGES) },
  { key: "employee_count", label: "Employee Count", group: "Team", type: "number", column: "t.employee_count", sortable: true },
  { key: "employee_range", label: "Company Size", group: "Team", type: "enum", column: "t.employee_range", options: opts(EMPLOYEE_RANGES) },
  { key: "headcount_growth_3m", label: "Headcount Growth (3m)", group: "Growth", type: "percent", column: "t.headcount_growth_3m", sortable: true },
  { key: "headcount_growth_12m", label: "Headcount Growth (12m)", group: "Growth", type: "percent", column: "t.headcount_growth_12m", sortable: true },
  { key: "total_funding_usd", label: "Total Funding (USD)", group: "Funding", type: "money", column: "t.total_funding_usd", sortable: true },
  { key: "last_funding_usd", label: "Last Funding Amount (USD)", group: "Funding", type: "money", column: "t.last_funding_usd", sortable: true },
  { key: "last_funding_date", label: "Last Funding Date", group: "Funding", type: "date", column: "t.last_funding_date", sortable: true },
  { key: "last_funding_type", label: "Last Funding Type", group: "Funding", type: "enum", column: "t.last_funding_type", options: opts(ROUND_TYPES) },
  { key: "investor_count", label: "Number of Investors", group: "Funding", type: "number", column: "t.investor_count", sortable: true },
  { key: "web_visits", label: "Web Visits (monthly)", group: "Web", type: "number", column: "t.web_visits", sortable: true },
  { key: "web_visits_growth_3m", label: "Web Visits Growth (3m)", group: "Web", type: "percent", column: "t.web_visits_growth_3m", sortable: true },
  { key: "linkedin_followers", label: "LinkedIn Followers", group: "Social", type: "number", column: "t.linkedin_followers", sortable: true },
  { key: "social_growth_3m", label: "Social Growth (3m)", group: "Social", type: "percent", column: "t.social_growth_3m", sortable: true },
  { key: "est_revenue_usd", label: "Est. Revenue (USD)", group: "Revenue & valuation", type: "money", column: "t.est_revenue_usd", sortable: true },
  { key: "est_valuation_usd", label: "Est. Valuation (USD)", group: "Revenue & valuation", type: "money", column: "t.est_valuation_usd", sortable: true },
  { key: "highlights", label: "Highlights", group: "Highlights", type: "multi", column: "t.highlights", options: opts(COMPANY_HIGHLIGHTS, HIGHLIGHT_LABELS) },
  { key: "rank", label: "Rank", group: "General", type: "number", column: "t.rank", sortable: true },
  { key: "list", label: "List", group: "Lists", type: "list", column: "t.id" },
];

const peopleFields: FieldDef[] = [
  { key: "full_name", label: "Name", group: "General", type: "text", column: "t.full_name", sortable: true },
  { key: "current_title", label: "Current Title", group: "General", type: "text", column: "t.current_title" },
  { key: "current_company_name", label: "Current Company", group: "General", type: "text", column: "t.current_company_name" },
  { key: "seniority", label: "Seniority", group: "General", type: "enum", column: "t.seniority", options: opts(SENIORITIES) },
  { key: "department", label: "Department", group: "General", type: "enum", column: "t.department", options: opts(DEPARTMENTS) },
  { key: "country", label: "Country", group: "Location", type: "enum", column: "t.country", options: opts(COUNTRIES) },
  { key: "location", label: "Location", group: "Location", type: "text", column: "t.location" },
  { key: "years_experience", label: "Years of Experience", group: "Career", type: "number", column: "t.years_experience", sortable: true },
  { key: "education_summary", label: "Education", group: "Career", type: "text", column: "t.education_summary" },
  { key: "highlights", label: "Highlights", group: "Highlights", type: "multi", column: "t.highlights", options: opts(PEOPLE_HIGHLIGHTS) },
  { key: "followers", label: "Followers", group: "Social", type: "number", column: "t.followers", sortable: true },
  { key: "connections", label: "Connections", group: "Social", type: "number", column: "t.connections", sortable: true },
  { key: "talent_signal_count", label: "Talent Signals", group: "Signals", type: "number", column: "t.talent_signal_count", sortable: true },
  { key: "list", label: "List", group: "Lists", type: "list", column: "t.id" },
];

const investorFields: FieldDef[] = [
  { key: "name", label: "Investor name", group: "General", type: "text", column: "t.name", sortable: true },
  { key: "type", label: "Investor Type", group: "General", type: "enum", column: "t.type", options: opts(INVESTOR_TYPES) },
  { key: "hq_country", label: "HQ Country", group: "Location", type: "enum", column: "t.hq_country", options: opts(COUNTRIES) },
  { key: "target_stages", label: "Target Stages", group: "Focus", type: "multi", column: "t.target_stages", options: opts(GROWTH_STAGES) },
  { key: "geographies", label: "Geographies", group: "Focus", type: "multi", column: "t.geographies", options: opts(REGIONS) },
  { key: "sectors", label: "Sectors", group: "Focus", type: "multi", column: "t.sectors", options: nodeOpts(TAXONOMY.sectors) },
  { key: "aum_usd", label: "AUM (USD)", group: "Fund", type: "money", column: "t.aum_usd", sortable: true },
  { key: "check_min", label: "Min Check (USD)", group: "Fund", type: "money", column: "t.check_min", sortable: true },
  { key: "check_max", label: "Max Check (USD)", group: "Fund", type: "money", column: "t.check_max", sortable: true },
  { key: "investments_count", label: "# Investments", group: "Track record", type: "number", column: "t.investments_count", sortable: true },
  { key: "exits_count", label: "# Exits", group: "Track record", type: "number", column: "t.exits_count", sortable: true },
  { key: "leads_count", label: "# Leads", group: "Track record", type: "number", column: "t.leads_count", sortable: true },
  { key: "follow_on_rate", label: "Follow-on Rate", group: "Track record", type: "percent", column: "t.follow_on_rate", sortable: true },
  { key: "unicorn_count", label: "Unicorns", group: "Track record", type: "number", column: "t.unicorn_count", sortable: true },
  { key: "highlights", label: "Highlights", group: "Highlights", type: "multi", column: "t.highlights", options: opts(INVESTOR_HIGHLIGHTS) },
  { key: "list", label: "List", group: "Lists", type: "list", column: "t.id" },
];

const roundFields: FieldDef[] = [
  { key: "type", label: "Investment Type", group: "Round", type: "enum", column: "t.type", options: opts(ROUND_TYPES) },
  { key: "amount_usd", label: "Raised (USD)", group: "Round", type: "money", column: "t.amount_usd", sortable: true },
  { key: "announced_date", label: "Announced Date", group: "Round", type: "date", column: "t.announced_date", sortable: true },
  { key: "post_money_usd", label: "Post-money (USD)", group: "Round", type: "money", column: "t.post_money_usd", sortable: true },
  { key: "company_name", label: "Company name", group: "Company", type: "text", column: "c.name" },
  { key: "company_country", label: "Company HQ Country", group: "Company", type: "enum", column: "c.hq_country", options: opts(COUNTRIES) },
  { key: "company_sector", label: "Company Sector", group: "Company", type: "enum", column: "c.sector_id", options: nodeOpts(TAXONOMY.sectors) },
  { key: "company_tech_vertical", label: "Company Tech Vertical", group: "Company", type: "multi", column: "c.tech_vertical_ids", options: nodeOpts(TAXONOMY.verticals), searchable: true },
];

const talentFields: FieldDef[] = [
  { key: "type", label: "Signal Type", group: "Signal", type: "enum", column: "t.type", options: opts(TALENT_SIGNAL_TYPES) },
  { key: "status", label: "Signal Status", group: "Signal", type: "enum", column: "t.status", options: opts(["STEALTH", "HR", "LIVE"]) },
  { key: "score", label: "Signal Score", group: "Signal", type: "number", column: "t.score", sortable: true },
  { key: "signal_date", label: "Signal Date", group: "Signal", type: "date", column: "t.signal_date", sortable: true },
  { key: "person_country", label: "Person Country", group: "Person", type: "enum", column: "p.country", options: opts(COUNTRIES) },
  { key: "person_highlights", label: "Person Highlights", group: "Person", type: "multi", column: "p.highlights", options: opts(PEOPLE_HIGHLIGHTS) },
];

/** Target-company fields shared by the transaction and news grids (alias `c`). */
const companyContext = (prefix: string, group = "Company"): FieldDef[] => [
  { key: `${prefix}_name`, label: `${group} name`, group, type: "text", column: "c.name" },
  { key: `${prefix}_country`, label: `${group} HQ Country`, group, type: "enum", column: "c.hq_country", options: opts(COUNTRIES) },
  { key: `${prefix}_region`, label: `${group} HQ Region`, group, type: "enum", column: "c.hq_region", options: opts(REGIONS) },
  { key: `${prefix}_sector`, label: `${group} Sector`, group, type: "enum", column: "c.sector_id", options: nodeOpts(TAXONOMY.sectors) },
  { key: `${prefix}_tech_vertical`, label: `${group} Tech Vertical`, group, type: "multi", column: "c.tech_vertical_ids", options: nodeOpts(TAXONOMY.verticals), searchable: true },
  { key: `${prefix}_stage`, label: `${group} Growth Stage`, group, type: "enum", column: "c.growth_stage", options: opts(GROWTH_STAGES) },
];

const acquisitionFields: FieldDef[] = [
  { key: "date", label: "Date", group: "Deal", type: "date", column: "t.date", sortable: true },
  { key: "amount_usd", label: "Amount (USD)", group: "Deal", type: "money", column: "t.amount_usd", sortable: true },
  { key: "status", label: "Status", group: "Deal", type: "enum", column: "t.status", options: opts(ACQUISITION_STATUSES) },
  { key: "acquirer_name", label: "Acquirer", group: "Deal", type: "text", column: "t.acquirer_name" },
  { key: "acquirer_tracked", label: "Acquirer is a tracked company", group: "Deal", type: "boolean", column: "(t.acquirer_id IS NOT NULL)" },
  ...companyContext("target", "Target"),
  { key: "target_list", label: "Target in list", group: "Lists", type: "list", column: "t.target_id" },
];

const ipoFields: FieldDef[] = [
  { key: "date", label: "IPO Date", group: "IPO", type: "date", column: "t.date", sortable: true },
  { key: "exchange", label: "Exchange", group: "IPO", type: "enum", column: "t.exchange", options: opts(IPO_EXCHANGES) },
  { key: "ticker", label: "Ticker", group: "IPO", type: "text", column: "t.ticker" },
  { key: "share_price", label: "Share price", group: "IPO", type: "number", column: "t.share_price", sortable: true },
  { key: "valuation_usd", label: "Valuation (USD)", group: "IPO", type: "money", column: "t.valuation_usd", sortable: true },
  { key: "raised_usd", label: "Raised (USD)", group: "IPO", type: "money", column: "t.raised_usd", sortable: true },
  ...companyContext("company"),
  { key: "company_list", label: "Company in list", group: "Lists", type: "list", column: "t.company_id" },
];

const newsFields: FieldDef[] = [
  { key: "category", label: "Category", group: "News", type: "enum", column: "t.category", options: opts(NEWS_SIGNAL_CATEGORIES) },
  { key: "score", label: "Signal Score (0–5)", group: "News", type: "number", column: "t.score", sortable: true },
  { key: "is_major", label: "Major news", group: "News", type: "boolean", column: "t.is_major" },
  { key: "published_at", label: "Published", group: "News", type: "date", column: "t.published_at", sortable: true },
  { key: "publisher", label: "Publisher", group: "News", type: "text", column: "ni.publisher" },
  ...companyContext("company"),
  { key: "company_list", label: "Company in list", group: "Lists", type: "list", column: "t.company_id" },
];

export const FIELDS: Record<Product, FieldDef[]> = {
  companies: companyFields,
  people: peopleFields,
  investors: investorFields,
  funding_rounds: roundFields,
  talent_signals: talentFields,
  acquisitions: acquisitionFields,
  ipos: ipoFields,
  news_signals: newsFields,
};

export function getField(product: Product, key: string): FieldDef | undefined {
  return FIELDS[product].find((f) => f.key === key);
}

export function optionLabel(field: FieldDef, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

export type ProductMeta = {
  label: string;
  singular: string;
  table: string;
  join?: string;
  defaultSort: { field: string; dir: "asc" | "desc" };
  /** Columns used for quick text search. */
  textColumns: string[];
};

export const PRODUCT_META: Record<Product, ProductMeta> = {
  companies: { label: "Companies", singular: "company", table: "companies", defaultSort: { field: "rank", dir: "asc" }, textColumns: ["t.name", "t.domain"] },
  people: { label: "People", singular: "person", table: "people", defaultSort: { field: "followers", dir: "desc" }, textColumns: ["t.full_name", "t.current_company_name"] },
  investors: { label: "Investors", singular: "investor", table: "investors", defaultSort: { field: "investments_count", dir: "desc" }, textColumns: ["t.name"] },
  funding_rounds: { label: "Funding Rounds", singular: "funding round", table: "funding_rounds", join: "JOIN companies c ON c.id = t.company_id", defaultSort: { field: "announced_date", dir: "desc" }, textColumns: ["c.name"] },
  talent_signals: { label: "Talent Signals", singular: "talent signal", table: "talent_signals", join: "JOIN people p ON p.id = t.person_id", defaultSort: { field: "signal_date", dir: "desc" }, textColumns: ["p.full_name"] },
  acquisitions: { label: "Acquisitions", singular: "acquisition", table: "acquisitions", join: "JOIN companies c ON c.id = t.target_id", defaultSort: { field: "date", dir: "desc" }, textColumns: ["c.name", "t.acquirer_name"] },
  ipos: { label: "IPOs", singular: "IPO", table: "ipos", join: "JOIN companies c ON c.id = t.company_id", defaultSort: { field: "date", dir: "desc" }, textColumns: ["c.name", "t.ticker"] },
  news_signals: { label: "News", singular: "news signal", table: "news_signals", join: "JOIN companies c ON c.id = t.company_id JOIN news_items ni ON ni.id = t.news_item_id", defaultSort: { field: "published_at", dir: "desc" }, textColumns: ["c.name", "ni.title"] },
};
