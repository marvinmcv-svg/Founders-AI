/**
 * Postgres schema (plan Section 8). R1 subset + the tables R1 features depend on.
 * IDs are public, stable and prefixed (com_, per_, inv_, trx_, sig_, ...).
 * Money: integer USD (whole dollars for entity data, cents are not needed for seed data;
 * the API exposes `*_usd` integers). Timestamps are UTC timestamptz.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const usd = (name: string) => bigint(name, { mode: "number" });

export type ReviewSource = "g2" | "trustpilot" | "chrome_web_store" | "app_store" | "google_play";
export type ReviewsDetail = Partial<
  Record<ReviewSource, { products: { name: string; rating: number; count: number }[]; rating: number; count: number; history: { month: string; rating: number; count: number }[]; fetched_at: string }>
>;
export type TractionSnapshot = {
  traffic_sources: Record<string, number>; // share 0-1: direct, search, social, referral, paid, email
  countries: { country: string; share: number }[];
  fetched_at: string;
  source: string;
};

export type Provenance = Record<string, { source: string; fetched_at: string; redistributable: boolean }>;

/* ------------------------------------------------------------------ */
/* Auth & tenancy (Better Auth tables, extended)                        */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").notNull().default("America/La_Paz"),
  /** Better Auth `twoFactor` plugin (plan 14.4 MFA). */
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
  /** How this session was created (password | sso | oauth); workspace "require SSO" checks it (plan 14.4). */
  loginMethod: text("login_method"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** = plan `organizations` */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  plan: text("plan").notNull().default("trial"),
  seats: integer("seats").notNull().default(5),
  mcpOverageEnabled: boolean("mcp_overage_enabled").notNull().default(false),
  /** Workspace security policies (plan 14.4): members must sign in with SSO / have 2FA on. */
  requireSso: boolean("require_sso").notNull().default(false),
  require2fa: boolean("require_2fa").notNull().default(false),
  thesis: jsonb("thesis").$type<Thesis>(),
  createdAt: createdAt(),
});

export type Thesis = {
  role?: string;
  firmType?: string;
  sectors?: string[];
  stages?: string[];
  geographies?: string[];
  checkSize?: string;
};

/** = plan `memberships` (role lives on membership; a user may belong to many orgs) */
export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // admin | member | viewer (+ better-auth "owner")
    agentInstructions: text("agent_instructions"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("member_org_user_uq").on(t.organizationId, t.userId)],
);

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: ts("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Taxonomy                                                            */
/* ------------------------------------------------------------------ */

export const taxonomyNodes = pgTable(
  "taxonomy_nodes",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // SECTOR | INDUSTRY | SUB_INDUSTRY | TECH_VERTICAL | ECOSYSTEM | BUSINESS_MODEL
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    parentId: text("parent_id"),
    path: text("path").notNull(), // dotted path of ancestor ids (ltree-compatible)
  },
  (t) => [index("taxonomy_kind_idx").on(t.kind), index("taxonomy_parent_idx").on(t.parentId)],
);

/* ------------------------------------------------------------------ */
/* Companies                                                           */
/* ------------------------------------------------------------------ */

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    domain: text("domain").notNull(),
    domainAliases: text("domain_aliases").array().notNull().default(sql`'{}'::text[]`),
    tagline: text("tagline"),
    description: text("description"),
    foundedYear: integer("founded_year"),
    hqCity: text("hq_city"),
    hqState: text("hq_state"),
    hqCountry: text("hq_country"),
    hqRegion: text("hq_region"),
    operatingStatus: text("operating_status").notNull().default("Active"),
    growthStage: text("growth_stage").notNull(),
    customerFocus: text("customer_focus"),
    businessModels: text("business_models").array().notNull().default(sql`'{}'::text[]`),
    sectorId: text("sector_id"),
    industryIds: text("industry_ids").array().notNull().default(sql`'{}'::text[]`),
    techVerticalIds: text("tech_vertical_ids").array().notNull().default(sql`'{}'::text[]`),
    ecosystemIds: text("ecosystem_ids").array().notNull().default(sql`'{}'::text[]`),
    employeeCount: integer("employee_count"),
    employeeRange: text("employee_range"),
    rank: integer("rank"),
    rankScore: real("rank_score"),
    highlights: text("highlights").array().notNull().default(sql`'{}'::text[]`),
    newHighlights: text("new_highlights").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    bootstrapped: boolean("bootstrapped").notNull().default(false),
    totalFundingUsd: usd("total_funding_usd"),
    lastFundingUsd: usd("last_funding_usd"),
    lastFundingDate: date("last_funding_date"),
    lastFundingType: text("last_funding_type"),
    roundCount: integer("round_count").notNull().default(0),
    postMoneyValuationUsd: usd("post_money_valuation_usd"),
    investorCount: integer("investor_count").notNull().default(0),
    // Denormalised growth metrics (latest values) — filterable without the metrics table.
    webVisits: integer("web_visits"),
    webVisitsGrowth3m: real("web_visits_growth_3m"),
    headcountGrowth3m: real("headcount_growth_3m"),
    headcountGrowth12m: real("headcount_growth_12m"),
    linkedinFollowers: integer("linkedin_followers"),
    socialGrowth3m: real("social_growth_3m"),
    estRevenueUsd: usd("est_revenue_usd"),
    estValuationUsd: usd("est_valuation_usd"),
    patentCount: integer("patent_count").notNull().default(0),
    trademarkCount: integer("trademark_count").notNull().default(0),
    technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
    certifications: text("certifications").array().notNull().default(sql`'{}'::text[]`),
    customerProfile: text("customer_profile"),
    tractionHighlights: text("traction_highlights"),
    contactEmail: text("contact_email"),
    socials: jsonb("socials").$type<Record<string, string>>(),
    reviews: jsonb("reviews").$type<Record<string, { rating: number; count: number }>>(),
    /** Review sites detail (Reviews tab): per source → products, rating, count, history. */
    reviewsDetail: jsonb("reviews_detail").$type<ReviewsDetail>(),
    /** Traffic sources, country mix, app-store snapshot (Traction Metrics tab). */
    traction: jsonb("traction").$type<TractionSnapshot>(),
    embedding: vector("embedding", { dimensions: 256 }),
    provenance: jsonb("provenance").$type<Provenance>(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_domain_uq").on(t.domain),
    index("companies_rank_idx").on(t.rank),
    index("companies_stage_idx").on(t.growthStage),
    index("companies_country_idx").on(t.hqCountry),
    index("companies_sector_idx").on(t.sectorId),
    index("companies_funding_idx").on(t.totalFundingUsd),
    index("companies_last_funding_idx").on(t.lastFundingDate),
    index("companies_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("companies_industry_gin").using("gin", t.industryIds),
    index("companies_vertical_gin").using("gin", t.techVerticalIds),
    index("companies_highlights_gin").using("gin", t.highlights),
  ],
);

export const companyPeople = pgTable(
  "company_people",
  {
    companyId: text("company_id").notNull(),
    personId: text("person_id").notNull(),
    title: text("title"),
    department: text("department"),
    seniority: text("seniority"),
    isFounder: boolean("is_founder").notNull().default(false),
    start: date("start"),
    end: date("end"),
    isCurrent: boolean("is_current").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.personId] }),
    index("company_people_person_idx").on(t.personId),
  ],
);

export const companyCompetitors = pgTable(
  "company_competitors",
  {
    companyId: text("company_id").notNull(),
    competitorId: text("competitor_id").notNull(),
    overlapScore: real("overlap_score").notNull(),
    reason: text("reason"),
    modelVersion: text("model_version").notNull().default("v0-taxonomy"),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.competitorId] })],
);

export const companyEstimates = pgTable(
  "company_estimates",
  {
    companyId: text("company_id").notNull(),
    month: date("month").notNull(),
    revenueP10: usd("revenue_p10"),
    revenueP50: usd("revenue_p50"),
    revenueP90: usd("revenue_p90"),
    revenueType: text("revenue_type").notNull().default("ARR"),
    valuationP10: usd("valuation_p10"),
    valuationP50: usd("valuation_p50"),
    valuationP90: usd("valuation_p90"),
    confidence: text("confidence").notNull(), // LOW | MEDIUM | HIGH
    drivers: jsonb("drivers").$type<{ label: string; impact: number }[]>(),
    modelVersion: text("model_version").notNull(),
  },
  // Versioned rows (plan 9.6): readers use the active REVENUE model; rollback = repoint `model_versions.active`.
  (t) => [primaryKey({ columns: [t.companyId, t.month, t.modelVersion] })],
);

export const revenueDisclosures = pgTable(
  "revenue_disclosures",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    amountUsd: usd("amount_usd").notNull(),
    type: text("type").notNull(),
    period: date("period").notNull(),
    sourceUrl: text("source_url"),
    publisher: text("publisher"),
    publishedAt: ts("published_at"),
    verifiedBy: text("verified_by"),
    status: text("status").notNull().default("verified"), // pending | verified | rejected
    /** Where the anchor came from: seed | news_extraction | manual. */
    origin: text("origin").notNull().default("seed"),
    newsSignalId: text("news_signal_id"),
    evidence: text("evidence"),
    reviewedAt: ts("reviewed_at"),
    createdAt: ts("created_at").defaultNow(),
  },
  (t) => [index("revenue_disclosures_company_idx").on(t.companyId)],
);

export const newsItems = pgTable(
  "news_items",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    publisher: text("publisher").notNull(),
    title: text("title").notNull(),
    publishedAt: ts("published_at").notNull(),
    bodyHash: text("body_hash"),
  },
  (t) => [index("news_items_url_idx").on(t.url)],
);

export const newsSignals = pgTable(
  "news_signals",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    newsItemId: text("news_item_id").notNull(),
    category: text("category").notNull(), // revenue | profitability | traction | funding | deals | other
    summary: text("summary").notNull(),
    score: real("score").notNull(), // 0-5
    isMajor: boolean("is_major").notNull().default(false),
    figures: jsonb("figures"),
    publishedAt: ts("published_at").notNull(),
    modelVersion: text("model_version").notNull().default("v0-seed"),
  },
  (t) => [index("news_signals_company_idx").on(t.companyId, t.publishedAt), index("news_signals_published_idx").on(t.publishedAt)],
);

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    first: text("first").notNull(),
    last: text("last").notNull(),
    headline: text("headline"),
    bio: text("bio"),
    location: text("location"),
    country: text("country"),
    linkedinUrl: text("linkedin_url"),
    xUrl: text("x_url"),
    githubUrl: text("github_url"),
    avatarUrl: text("avatar_url"),
    currentTitle: text("current_title"),
    currentCompanyId: text("current_company_id"),
    currentCompanyName: text("current_company_name"),
    department: text("department"),
    seniority: text("seniority"),
    yearsExperience: integer("years_experience"),
    highlights: text("highlights").array().notNull().default(sql`'{}'::text[]`),
    educationSummary: text("education_summary"),
    followers: integer("followers"),
    connections: integer("connections"),
    talentSignalCount: integer("talent_signal_count").notNull().default(0),
    embedding: vector("embedding", { dimensions: 256 }),
    provenance: jsonb("provenance").$type<Provenance>(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("people_linkedin_uq").on(t.linkedinUrl),
    index("people_company_idx").on(t.currentCompanyId),
    index("people_country_idx").on(t.country),
    index("people_seniority_idx").on(t.seniority),
    index("people_name_trgm").using("gin", sql`${t.fullName} gin_trgm_ops`),
    index("people_highlights_gin").using("gin", t.highlights),
  ],
);

export const personExperience = pgTable(
  "person_experience",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    companyId: text("company_id"),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    department: text("department"),
    start: date("start"),
    end: date("end"),
    isCurrent: boolean("is_current").notNull().default(false),
    isFounder: boolean("is_founder").notNull().default(false),
  },
  (t) => [index("person_experience_person_idx").on(t.personId)],
);

export const schools = pgTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain"),
  country: text("country"),
  tier: integer("tier").notNull().default(2),
});

export const personEducation = pgTable(
  "person_education",
  {
    personId: text("person_id").notNull(),
    schoolId: text("school_id").notNull(),
    degree: text("degree"),
    field: text("field"),
    start: integer("start"),
    end: integer("end"),
  },
  (t) => [primaryKey({ columns: [t.personId, t.schoolId] })],
);

export const personEmails = pgTable(
  "person_emails",
  {
    personId: text("person_id").notNull(),
    email: text("email").notNull(),
    type: text("type").notNull(), // work | personal
    status: text("status").notNull(), // verified | catch_all | unknown
    source: text("source").notNull(),
    checkedAt: ts("checked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.email] }), index("person_emails_email_idx").on(t.email)],
);

/* ------------------------------------------------------------------ */
/* Investors & transactions                                            */
/* ------------------------------------------------------------------ */

export const investors = pgTable(
  "investors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(), // VC | PE | CVC | Angel | Family office | Accelerator | Strategic
    domain: text("domain"),
    description: text("description"),
    hqCity: text("hq_city"),
    hqCountry: text("hq_country"),
    foundedYear: integer("founded_year"),
    aumUsd: usd("aum_usd"),
    checkMin: usd("check_min"),
    checkMax: usd("check_max"),
    targetStages: text("target_stages").array().notNull().default(sql`'{}'::text[]`),
    geographies: text("geographies").array().notNull().default(sql`'{}'::text[]`),
    sectors: text("sectors").array().notNull().default(sql`'{}'::text[]`),
    investmentsCount: integer("investments_count").notNull().default(0),
    exitsCount: integer("exits_count").notNull().default(0),
    leadsCount: integer("leads_count").notNull().default(0),
    followOnRate: real("follow_on_rate"),
    unicornCount: integer("unicorn_count").notNull().default(0),
    highlights: text("highlights").array().notNull().default(sql`'{}'::text[]`),
    personId: text("person_id"),
    provenance: jsonb("provenance").$type<Provenance>(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("investors_type_idx").on(t.type),
    index("investors_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const fundingRounds = pgTable(
  "funding_rounds",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    type: text("type").notNull(),
    amountUsd: usd("amount_usd"),
    currency: text("currency").notNull().default("USD"),
    announcedDate: date("announced_date").notNull(),
    preMoneyUsd: usd("pre_money_usd"),
    postMoneyUsd: usd("post_money_usd"),
    sourceUrls: text("source_urls").array().notNull().default(sql`'{}'::text[]`),
    provenance: jsonb("provenance").$type<Provenance>(),
  },
  (t) => [
    index("funding_rounds_company_idx").on(t.companyId),
    index("funding_rounds_date_idx").on(t.announcedDate),
    index("funding_rounds_type_idx").on(t.type),
  ],
);

export const roundInvestors = pgTable(
  "round_investors",
  {
    roundId: text("round_id").notNull(),
    investorId: text("investor_id").notNull(),
    isLead: boolean("is_lead").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.investorId] }),
    index("round_investors_investor_idx").on(t.investorId),
  ],
);

export const acquisitions = pgTable(
  "acquisitions",
  {
    id: text("id").primaryKey(),
    acquirerId: text("acquirer_id"),
    acquirerName: text("acquirer_name").notNull(),
    targetId: text("target_id").notNull(),
    date: date("date").notNull(),
    amountUsd: usd("amount_usd"),
    status: text("status").notNull().default("Completed"),
    sourceUrls: text("source_urls").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [index("acquisitions_target_idx").on(t.targetId), index("acquisitions_date_idx").on(t.date)],
);

export const ipos = pgTable(
  "ipos",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    date: date("date").notNull(),
    exchange: text("exchange").notNull(),
    ticker: text("ticker").notNull(),
    sharePrice: real("share_price"),
    valuationUsd: usd("valuation_usd"),
    raisedUsd: usd("raised_usd"),
  },
  (t) => [index("ipos_company_idx").on(t.companyId)],
);

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

export const talentSignals = pgTable(
  "talent_signals",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    type: text("type").notNull(), // NEW_COMPANY | NEW_ROLE | PROMOTION | SEARCHING | OUT_OF_STEALTH | DEPARTURE
    status: text("status").notNull(), // STEALTH | HR | LIVE
    score: integer("score").notNull(),
    summary: text("summary").notNull(),
    signalDate: date("signal_date").notNull(),
    newCompanyId: text("new_company_id"),
    prevCompanyIds: text("prev_company_ids").array().notNull().default(sql`'{}'::text[]`),
    sources: jsonb("sources").$type<{ kind: string; url?: string }[]>(),
    /** Structured facts the summary was generated from (no-hallucination contract, plan 9.3). */
    facts: jsonb("facts").$type<Record<string, unknown>>(),
    modelVersion: text("model_version").notNull().default("v0-seed"),
    createdAt: ts("created_at").defaultNow(),
  },
  (t) => [
    index("talent_signals_person_idx").on(t.personId),
    index("talent_signals_date_idx").on(t.signalDate),
  ],
);

/* ------------------------------------------------------------------ */
/* Workspace objects (org-scoped — access only via packages/core repo)  */
/* ------------------------------------------------------------------ */

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    entityType: text("entity_type").notNull(), // COMPANY | PERSON | INVESTOR
    visibility: text("visibility").notNull().default("TEAM"), // PRIVATE | TEAM
    system: text("system"), // MY_CRM | MY_NETWORK | LIKED | null
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("lists_org_idx").on(t.orgId)],
);

export const listItems = pgTable(
  "list_items",
  {
    listId: text("list_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    addedBy: text("added_by").notNull(),
    status: text("status"),
    customFields: jsonb("custom_fields"),
    note: text("note"),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.entityId] })],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    product: text("product").notNull(),
    filterAst: jsonb("filter_ast").notNull(),
    nlQuery: text("nl_query"),
    sort: jsonb("sort"),
    visibility: text("visibility").notNull().default("TEAM"),
    alertCadence: text("alert_cadence").notNull().default("OFF"), // OFF | REALTIME | DAILY | WEEKLY
    channels: jsonb("channels").$type<string[]>(),
    lastRunAt: ts("last_run_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("saved_searches_org_idx").on(t.orgId)],
);

export const searchResultSnapshots = pgTable(
  "search_result_snapshots",
  {
    searchId: text("search_id").notNull(),
    entityId: text("entity_id").notNull(),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.entityId] })],
);

export const searchReads = pgTable(
  "search_reads",
  {
    searchId: text("search_id").notNull(),
    readerId: text("reader_id").notNull(), // user id | api key id | mcp client id
    lastReadAt: ts("last_read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.readerId] })],
);

export const orgStatuses = pgTable("org_statuses", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  label: text("label").notNull(),
  color: text("color").notNull(),
  order: integer("order").notNull(),
});

export const entityStatus = pgTable(
  "entity_status",
  {
    orgId: text("org_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    statusId: text("status_id").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.entityId] })],
);

export const likes = pgTable(
  "likes",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId, t.entityId] })],
);

export const hides = pgTable(
  "hides",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId, t.entityId] })],
);

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notes_entity_idx").on(t.orgId, t.entityId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.orgId, t.userId)],
);

export const digestRuns = pgTable("digest_runs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  cadence: text("cadence").notNull(),
  sentAt: ts("sent_at").notNull().defaultNow(),
  itemCount: integer("item_count").notNull(),
  html: text("html"),
});

/* ------------------------------------------------------------------ */
/* API, credits, usage                                                 */
/* ------------------------------------------------------------------ */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("PENDING"), // PENDING | ACTIVE | REVOKED
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_uq").on(t.hash), index("api_keys_org_idx").on(t.orgId)],
);

export const creditBalances = pgTable("credit_balances", {
  orgId: text("org_id").primaryKey(),
  balance: integer("balance").notNull(),
  /** How far below zero charges may go when overage is on (billed through the Stripe meter). 0 = hard stop. */
  overageLimit: integer("overage_limit").notNull().default(0),
  periodStart: ts("period_start").notNull().defaultNow(),
  periodEnd: ts("period_end"),
});

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    operation: text("operation"),
    requestId: text("request_id"),
    /** Part of this debit that took the balance below zero (billed on the Stripe meter, plan 14.1). */
    overage: integer("overage").notNull().default(0),
    /** Set when `overage` was sent to the Stripe meter. */
    reportedAt: ts("reported_at"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("credit_ledger_org_idx").on(t.orgId, t.at)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    surface: text("surface").notNull(), // API | MCP | APP | EXT | AGENT
    operation: text("operation").notNull(),
    matched: boolean("matched").notNull(),
    credits: integer("credits").notNull(),
    latencyMs: integer("latency_ms"),
    requestId: text("request_id"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("usage_events_org_idx").on(t.orgId, t.at)],
);

/**
 * Audit log (plan 14.4). `org_id = 'platform'` for internal-admin actions. Rows are chained per org:
 * `hash = sha256(prev_hash | canonical row)`, so an edited or deleted row breaks verification.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    actor: text("actor").notNull(),
    actorType: text("actor_type").notNull().default("user"), // user | api_key | scim | system | platform_admin | stripe
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    seq: bigint("seq", { mode: "number" }),
    prevHash: text("prev_hash"),
    hash: text("hash"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_at_idx").on(t.orgId, t.at), uniqueIndex("audit_log_org_seq_uq").on(t.orgId, t.seq)],
);

/* ------------------------------------------------------------------ */
/* Public forms                                                        */
/* ------------------------------------------------------------------ */

/** Mock CRM sink for the demo form until HubSpot is connected (H3). */
export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // DEMO | PARTNER | NEWSLETTER
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull(),
  company: text("company"),
  firmType: text("firm_type"),
  aum: text("aum"),
  phone: text("phone"),
  partnershipType: text("partnership_type"),
  message: text("message"),
  locale: text("locale"),
  route: text("route"),
  createdAt: createdAt(),
});

/** Data-subject requests (plan 14.5). Status: RECEIVED → VERIFIED → IN_PROGRESS → COMPLETED | REJECTED. */
export const dsarRequests = pgTable("dsar_requests", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  type: text("type").notNull(), // ACCESS | DELETE | OPT_OUT
  entityId: text("entity_id"),
  details: text("details"),
  linkedinUrl: text("linkedin_url"),
  status: text("status").notNull().default("RECEIVED"),
  /** Statutory clock: GDPR one month / CCPA 45 days; we use 30 days from receipt. */
  dueAt: ts("due_at"),
  /** SHA-256 of the email-verification token (the token itself is only in the email). */
  verifyTokenHash: text("verify_token_hash"),
  verifiedAt: ts("verified_at"),
  matchedPersonIds: text("matched_person_ids").array().notNull().default(sql`'{}'::text[]`),
  handledBy: text("handled_by"),
  completedAt: ts("completed_at"),
  /** ACCESS: the export (JSON) delivered to the requester; DELETE/OPT_OUT: counts of what was removed. */
  result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const dsarEvents = pgTable(
  "dsar_events",
  {
    id: text("id").primaryKey(),
    dsarId: text("dsar_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("dsar_events_dsar_idx").on(t.dsarId, t.at)],
);

/**
 * Suppression list (plan 14.5): blocks re-ingestion of people who asked to be deleted or opted out.
 * Values are stored as SHA-256 of the normalised value, so the list itself holds no contact data.
 * kind: email | linkedin | person_id
 */
export const suppressionList = pgTable(
  "suppression_list",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    valueHash: text("value_hash").notNull(),
    reason: text("reason").notNull(), // DELETE | OPT_OUT | ADMIN
    dsarId: text("dsar_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppression_kind_hash_uq").on(t.kind, t.valueHash)],
);

/* ------------------------------------------------------------------ */
/* Partitioned metrics table (created by custom migration 0001)        */
/* ------------------------------------------------------------------ */

export const companyMetricsDaily = pgTable(
  "company_metrics_daily",
  {
    companyId: text("company_id").notNull(),
    metric: text("metric").notNull(), // employee_count | web_visits | linkedin_followers
    date: date("date").notNull(),
    value: real("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.metric, t.date] })],
);

/* ------------------------------------------------------------------ */
/* Phase 4 (R2): pipelines, outbox, signals history, alerts            */
/* ------------------------------------------------------------------ */

/** One row per pipeline job execution (plan 9.2: counts/errors per run). */
/**
 * Entity resolution (plan 9.1, D-072): scored duplicate pairs. `pending` pairs wait in /admin;
 * `rejected` pairs never resurface; `merged` / `auto_merged` record who merged what.
 * left_id < right_id, so each pair is stored once.
 */
export const entityMatchCandidates = pgTable(
  "entity_match_candidates",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // company | person
    leftId: text("left_id").notNull(),
    rightId: text("right_id").notNull(),
    probability: real("probability").notNull(),
    weight: real("weight").notNull(),
    reason: text("reason").notNull(),
    comparisons: jsonb("comparisons").$type<{ field: string; level: string; weight: number }[]>().notNull(),
    status: text("status").notNull().default("pending"), // pending | merged | auto_merged | rejected
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_match_pair_uq").on(t.kind, t.leftId, t.rightId),
    index("entity_match_status_idx").on(t.status, t.probability),
  ],
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: text("id").primaryKey(),
    job: text("job").notNull(),
    status: text("status").notNull(), // RUNNING | SUCCEEDED | FAILED
    trigger: text("trigger").notNull().default("manual"), // manual | cron | api
    counts: jsonb("counts").$type<Record<string, number>>(),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("pipeline_runs_job_idx").on(t.job, t.startedAt)],
);

/**
 * Transactional outbox (plan 8): every pipeline write that can change search results appends
 * here. Consumers: real-time alerts (now) and the OpenSearch indexer (when H2 lands).
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    product: text("product").notNull(), // companies | people | talent_signals | news_signals | ...
    entityId: text("entity_id").notNull(),
    kind: text("kind").notNull(), // CREATED | UPDATED
    at: ts("at").notNull().defaultNow(),
    alertsProcessedAt: ts("alerts_processed_at"),
  },
  (t) => [index("outbox_alerts_pending_idx").on(t.id).where(sql`alerts_processed_at IS NULL`)],
);

/** Highlight history so `new_highlights` = highlights added in the last 30 days (plan 7.4). */
export const highlightEvents = pgTable(
  "highlight_events",
  {
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(), // COMPANY | PERSON | INVESTOR
    highlight: text("highlight").notNull(),
    addedAt: ts("added_at").notNull().defaultNow(),
    removedAt: ts("removed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.highlight, t.addedAt] }),
    index("highlight_events_open_idx").on(t.entityId).where(sql`removed_at IS NULL`),
  ],
);

/** Bronze layer of the person change feed (plan 9.3 input). */
export const personChanges = pgTable(
  "person_changes",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    source: text("source").notNull(),
    observedAt: ts("observed_at").notNull(),
    before: jsonb("before").notNull(),
    after: jsonb("after").notNull(),
    /** Ground truth from synthetic feeds only (evaluation); null for real providers. */
    label: text("label"),
    processedAt: ts("processed_at"),
    signalId: text("signal_id"),
  },
  (t) => [index("person_changes_pending_idx").on(t.observedAt).where(sql`processed_at IS NULL`)],
);

/** Bronze layer of the news feed (plan 9.5 input). */
export const newsRaw = pgTable(
  "news_raw",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    url: text("url").notNull(),
    publisher: text("publisher").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    publishedAt: ts("published_at").notNull(),
    simhash: text("simhash").notNull(), // 64-bit hex
    status: text("status").notNull().default("NEW"), // NEW | DUPLICATE | LINKED | UNLINKED
    duplicateOf: text("duplicate_of"),
    label: jsonb("label"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("news_raw_url_uq").on(t.url), index("news_raw_status_idx").on(t.status)],
);

/** Per-org integrations (Slack incoming webhook now; OAuth apps in R3/H9). Secrets are AES-GCM encrypted. */
export const orgIntegrations = pgTable(
  "org_integrations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(), // SLACK | WEBHOOK
    label: text("label"),
    secret: text("secret").notNull(), // encrypted
    status: text("status").notNull().default("ACTIVE"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("org_integrations_org_provider_uq").on(t.orgId, t.provider)],
);

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    searchId: text("search_id"),
    userId: text("user_id"),
    channel: text("channel").notNull(), // in_app | email | slack
    status: text("status").notNull(), // SENT | STORED | FAILED | SKIPPED
    itemCount: integer("item_count").notNull(),
    error: text("error"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("alert_deliveries_org_idx").on(t.orgId, t.at)],
);

/** Registry of model versions (plan 9.6: UI/API expose it; rollback = repoint `active`). */
export const modelVersions = pgTable(
  "model_versions",
  {
    version: text("version").primaryKey(),
    kind: text("kind").notNull(), // REVENUE | TALENT_SCORE | COMPETITORS | NEWS
    active: boolean("active").notNull().default(false),
    metrics: jsonb("metrics").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("model_versions_kind_idx").on(t.kind)],
);

/* ------------------------------------------------------------------ */
/* Phase 5b (R2): webhooks, persisted AI-search queries, idempotency   */
/* ------------------------------------------------------------------ */

export const WEBHOOK_EVENTS = ["search.new_results", "list.news", "signal.talent", "signal.interest", "crm.sync"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Customer webhook endpoints (plan 11 #71–74). The signing secret is AES-GCM encrypted at rest. */
export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    url: text("url").notNull(),
    events: text("events").array().notNull(),
    secret: text("secret").notNull(), // encrypted
    secretPrefix: text("secret_prefix").notNull(),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | DISABLED
    disabledReason: text("disabled_reason"),
    /** Start of the current unbroken failure streak; auto-disable after 24 h (plan 11 security). */
    failingSince: ts("failing_since"),
    /** Who created it: `api` (customer endpoint) or `zapier` (REST-hook subscription, plan 13.4). */
    source: text("source").notNull().default("api"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("webhooks_org_idx").on(t.orgId)],
);

/** One row per event per endpoint; retried with exponential backoff up to 6 times. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id").notNull(),
    orgId: text("org_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | DELIVERED | FAILED
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveredAt: ts("delivered_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("webhook_deliveries_due_idx").on(t.nextAttemptAt).where(sql`status = 'PENDING'`),
    index("webhook_deliveries_hook_idx").on(t.webhookId, t.createdAt),
  ],
);

/** AI-search queries, so `GET /search/{queryId}/results` works across serverless instances. */
export const apiQueries = pgTable(
  "api_queries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    product: text("product").notNull(),
    query: text("query").notNull(),
    filter: jsonb("filter").notNull(),
    sort: jsonb("sort"),
    explanation: text("explanation"),
    createdAt: createdAt(),
  },
  (t) => [index("api_queries_org_idx").on(t.orgId, t.createdAt)],
);

/** Idempotency-Key replay store for POST requests (24 h). */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    orgId: text("org_id").notNull(),
    key: text("key").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    bodyHash: text("body_hash").notNull(),
    status: integer("status").notNull(),
    response: text("response").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
);

/* ------------------------------------------------------------------ */
/* Phase 6 (R2): agent threads, skills, personalization, schedules     */
/* ------------------------------------------------------------------ */

export type AgentSource = { id: string; kind: "company" | "person" | "investor" | "round" | "signal" | "news" | "list" | "search" | "web"; label: string; url?: string };
export type AgentStep = { id: string; tool: string; label: string; status: "running" | "done" | "error" | "awaiting_confirmation" | "denied"; summary?: string; sources?: string[]; ms?: number };
export type AgentTable = { id: string; title: string; product: string | null; columns: { key: string; label: string }[]; rows: Record<string, unknown>[] };
export type AgentPending = { toolUseId: string; tool: string; input: Record<string, unknown>; label: string };

/** A conversation with the agent (plan 10.1). TEAM threads are visible to the whole workspace. */
export const agentThreads = pgTable(
  "agent_threads",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    visibility: text("visibility").notNull().default("PRIVATE"), // PRIVATE | TEAM
    /** Tools the user allowed for the rest of this thread ("Always for this thread"). */
    allowedTools: text("allowed_tools").array().notNull().default(sql`'{}'::text[]`),
    /** Page the thread was started from, e.g. { entityId: "com_…" }. */
    context: jsonb("context").$type<Record<string, unknown>>(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("agent_threads_org_idx").on(t.orgId, t.updatedAt)],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    orgId: text("org_id").notNull(),
    role: text("role").notNull(), // user | assistant
    authorId: text("author_id"),
    text: text("text").notNull().default(""),
    /** Raw model transcript for this turn (assistant + tool_result blocks), replayed on the next turn. */
    transcript: jsonb("transcript").$type<unknown[]>(),
    steps: jsonb("steps").$type<AgentStep[]>(),
    sources: jsonb("sources").$type<AgentSource[]>(),
    tables: jsonb("tables").$type<AgentTable[]>(),
    artifactIds: text("artifact_ids").array(),
    pending: jsonb("pending").$type<AgentPending>(),
    status: text("status").notNull().default("done"), // running | awaiting_confirmation | done | error
    engine: text("engine"), // claude | rules
    skillSlug: text("skill_slug"),
    usage: jsonb("usage").$type<Record<string, number>>(),
    /** Guardrail result: numbers in the answer that no tool result supports (must be empty). */
    unsourced: text("unsourced").array(),
    createdAt: createdAt(),
  },
  (t) => [index("agent_messages_thread_idx").on(t.threadId, t.createdAt)],
);

/** Long outputs saved from a thread: memo, table, chart, email draft (plan 10.1 artifacts). */
export const agentArtifacts = pgTable(
  "agent_artifacts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    threadId: text("thread_id"),
    kind: text("kind").notNull(), // memo | table | chart | email | csv
    title: text("title").notNull(),
    content: jsonb("content").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("agent_artifacts_org_idx").on(t.orgId, t.createdAt)],
);

/** Workspace skills (plan 10.2). Curated skills live in code (packages/agent) and are read-only. */
export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    steps: text("steps").array().notNull(),
    inputs: jsonb("inputs").$type<{ name: string; label: string; kind: "text" | "company" | "person" | "investor" | "list" | "search" }[]>(),
    outputFormat: text("output_format").notNull().default(""),
    visibility: text("visibility").notNull().default("PRIVATE"), // PRIVATE | TEAM
    status: text("status").notNull().default("SAVED"), // DRAFT | SAVED
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("skills_org_slug_uq").on(t.orgId, t.slug).where(sql`deleted_at IS NULL`), index("skills_org_idx").on(t.orgId)],
);

/** Agent personalization (plan 10.1 Context). user_id '*' holds the workspace default. */
export const agentPreferences = pgTable(
  "agent_preferences",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    instructions: jsonb("instructions").$type<Record<string, unknown>>().notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

/** Scheduled skills (plan 10.1): run a skill on a cadence and deliver the answer. */
export const skillSchedules = pgTable(
  "skill_schedules",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    skillSlug: text("skill_slug").notNull(),
    prompt: text("prompt").notNull().default(""),
    cadence: text("cadence").notNull(), // DAILY | WEEKLY
    weekday: integer("weekday"), // 1 = Monday (WEEKLY)
    hour: integer("hour").notNull().default(7),
    timezone: text("timezone").notNull().default("America/La_Paz"),
    channels: text("channels").array().notNull().default(sql`'{in_app}'::text[]`),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | PAUSED
    lastRunAt: ts("last_run_at"),
    lastThreadId: text("last_thread_id"),
    createdAt: createdAt(),
  },
  (t) => [index("skill_schedules_org_idx").on(t.orgId)],
);

/* ------------------------------------------------------------------ */
/* Phase 7 (R2): OAuth 2.1 authorization server for MCP (Better Auth    */
/* `jwt` + `@better-auth/mcp`). Shapes follow the plugins' getSchema(). */
/* ------------------------------------------------------------------ */

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

const strArr = (name: string) => text(name).array();

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: strArr("scopes"),
    clientCredentialsScopes: strArr("client_credentials_scopes").default(sql`'{}'::text[]`),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: strArr("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: strArr("redirect_uris").notNull(),
    postLogoutRedirectUris: strArr("post_logout_redirect_uris"),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: strArr("grant_types"),
    responseTypes: strArr("response_types"),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (t) => [index("oauth_client_user_idx").on(t.userId)],
);

export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: strArr("allowed_scopes"),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("oauth_client_resource_client_resource_uidx").on(t.clientId, t.resourceId), index("oauth_client_resource_resource_idx").on(t.resourceId)],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: strArr("resources"),
    requestedUserInfoClaims: strArr("requested_user_info_claims"),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at"),
    revoked: ts("revoked"),
    rotatedAt: ts("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: ts("rotation_replay_expires_at"),
    authTime: ts("auth_time"),
    confirmation: jsonb("confirmation"),
    scopes: strArr("scopes").notNull(),
  },
  (t) => [index("oauth_refresh_token_client_idx").on(t.clientId), index("oauth_refresh_token_user_idx").on(t.userId), index("oauth_refresh_token_code_idx").on(t.authorizationCodeId)],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: strArr("resources"),
    requestedUserInfoClaims: strArr("requested_user_info_claims"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at"),
    revoked: ts("revoked"),
    confirmation: jsonb("confirmation"),
    scopes: strArr("scopes").notNull(),
  },
  (t) => [index("oauth_access_token_client_idx").on(t.clientId), index("oauth_access_token_user_idx").on(t.userId), index("oauth_access_token_refresh_idx").on(t.refreshId), index("oauth_access_token_code_idx").on(t.authorizationCodeId)],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: strArr("resources"),
    requestedUserInfoClaims: strArr("requested_user_info_claims"),
    scopes: strArr("scopes").notNull(),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("oauth_consent_client_idx").on(t.clientId), index("oauth_consent_user_idx").on(t.userId)],
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
});

/* ------------------------------------------------------------------ */
/* Phase 8 (R3): CRM sync, network, bulk delivery, interest, flags     */
/* ------------------------------------------------------------------ */

export const CRM_PROVIDERS = ["ATTIO", "AFFINITY", "SALESFORCE", "HUBSPOT", "PIPEDRIVE", "AIRTABLE"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

/**
 * One CRM connection per org and provider (plan 13.1). `auth` holds the encrypted credentials
 * (OAuth tokens once the marketplace apps exist, H9; an API token, or nothing in SANDBOX mode).
 */
export const crmConnections = pgTable(
  "crm_connections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(),
    mode: text("mode").notNull().default("SANDBOX"), // SANDBOX | TOKEN | OAUTH
    auth: text("auth"), // encrypted JSON
    pullConfig: jsonb("pull_config").$type<Record<string, unknown>>(),
    pushConfig: jsonb("push_config").$type<Record<string, unknown>>(),
    schedule: text("schedule").notNull().default("OFF"), // OFF | DAILY | WEEKLY
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | ERROR | PAUSED
    lastError: text("last_error"),
    pullCursor: text("pull_cursor"),
    lastPullAt: ts("last_pull_at"),
    lastPushAt: ts("last_push_at"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("crm_connections_org_provider_uq").on(t.orgId, t.provider)],
);

/** CRM objects pulled into the workspace and matched to our entities. */
export const crmRecords = pgTable(
  "crm_records",
  {
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(),
    object: text("object").notNull(), // COMPANY | PERSON | DEAL
    externalId: text("external_id").notNull(),
    name: text("name"),
    domain: text("domain"),
    linkedinUrl: text("linkedin_url"),
    entityType: text("entity_type"), // COMPANY | PERSON (null = unmatched)
    entityId: text("entity_id"),
    matchMethod: text("match_method"), // DOMAIN | LINKEDIN | NAME | PUSHED
    owner: text("owner"),
    stage: text("stage"),
    lastActivity: ts("last_activity"),
    openDeals: integer("open_deals").notNull().default(0),
    enrichedAt: ts("enriched_at"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.provider, t.object, t.externalId] }),
    index("crm_records_entity_idx").on(t.orgId, t.entityId),
  ],
);

export const crmSyncLog = pgTable(
  "crm_sync_log",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(),
    direction: text("direction").notNull(), // PULL | PUSH | ENRICH
    trigger: text("trigger").notNull().default("manual"), // manual | schedule | api | search
    entityCount: integer("entity_count").notNull().default(0),
    counts: jsonb("counts").$type<Record<string, number>>(),
    status: text("status").notNull(), // SUCCEEDED | PARTIAL | FAILED
    error: text("error"),
    actor: text("actor"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("crm_sync_log_org_idx").on(t.orgId, t.at)],
);

/**
 * Remote side of SANDBOX connections: a per-org fake CRM that speaks each provider's object shapes,
 * so the demo and the round-trip tests exercise the real adapter code without vendor accounts (H9).
 */
export const crmSandboxObjects = pgTable(
  "crm_sandbox_objects",
  {
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(),
    object: text("object").notNull(), // provider-native object name
    externalId: text("external_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.provider, t.object, t.externalId] })],
);

/** Per-user network sources (plan 13.2). Mail/calendar tokens are encrypted; content is never stored. */
export const networkSources = pgTable(
  "network_sources",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(), // LINKEDIN_CSV | GMAIL | OUTLOOK | GCAL | MSCAL
    status: text("status").notNull().default("ACTIVE"),
    auth: text("auth"),
    stats: jsonb("stats").$type<Record<string, number>>(),
    lastSync: ts("last_sync"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("network_sources_user_provider_uq").on(t.orgId, t.userId, t.provider)],
);

/** One edge per (user, person); per-channel evidence feeds the strength score. */
export const networkEdges = pgTable(
  "network_edges",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    personId: text("person_id").notNull(),
    strength: real("strength").notNull(),
    lastInteractionAt: ts("last_interaction_at"),
    sources: text("sources").array().notNull().default(sql`'{}'::text[]`),
    evidence: jsonb("evidence").$type<Record<string, { count: number; last: string | null }>>().notNull(),
    /** The person's company when the edge was last confirmed; drives "hired from your network" alerts. */
    companyIdAtSync: text("company_id_at_sync"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId, t.personId] }),
    index("network_edges_person_idx").on(t.orgId, t.personId),
  ],
);

/** Bulk delivery projects (plan 13.5). Sink credentials are encrypted. */
export const bulkDeliveries = pgTable(
  "bulk_deliveries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    datasets: text("datasets").array().notNull(),
    fields: jsonb("fields").$type<Record<string, string[]>>(),
    format: text("format").notNull().default("PARQUET"), // CSV | PARQUET
    sink: text("sink").notNull(), // S3 | GCS | SNOWFLAKE | LOCAL
    sinkConfig: text("sink_config").notNull(), // encrypted JSON
    cadence: text("cadence").notNull().default("DAILY"), // DAILY | WEEKLY | MANUAL
    status: text("status").notNull().default("ACTIVE"),
    lastRun: ts("last_run"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("bulk_deliveries_org_idx").on(t.orgId)],
);

export const bulkRuns = pgTable(
  "bulk_runs",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id").notNull(),
    orgId: text("org_id").notNull(),
    kind: text("kind").notNull(), // FULL | INCREMENTAL
    status: text("status").notNull(), // RUNNING | SUCCEEDED | FAILED
    manifest: jsonb("manifest").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("bulk_runs_delivery_idx").on(t.deliveryId, t.startedAt)],
);

/**
 * What each delivery last shipped: one content hash per row. The next incremental is the exact diff
 * (new/changed → `upsert`, gone → `delete`) for any dataset, whatever its change tracking (D-058).
 */
export const bulkState = pgTable(
  "bulk_state",
  {
    deliveryId: text("delivery_id").notNull(),
    dataset: text("dataset").notNull(),
    entityId: text("entity_id").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.deliveryId, t.dataset, t.entityId] })],
);

/** Interest signals (plan 8, 9.4). Only public-evidence sources; telemetry is never a source here. */
export const interestSignals = pgTable(
  "interest_signals",
  {
    id: text("id").primaryKey(),
    targetCompanyId: text("target_company_id"),
    targetPersonId: text("target_person_id"),
    investorId: text("investor_id"),
    investorType: text("investor_type").notNull(), // VC | PE | CVC | ANGEL | STRATEGIC
    score: integer("score").notNull(),
    signalDate: date("signal_date").notNull(),
    sourceType: text("source_type").notNull(), // SOCIAL_FOLLOW | PUBLIC_CONTENT | EVENT | FILING
    evidence: text("evidence"),
    fundingContext: jsonb("funding_context").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("interest_signals_company_idx").on(t.targetCompanyId, t.signalDate),
    index("interest_signals_date_idx").on(t.signalDate),
  ],
);

/** Remote feature flags (extension LinkedIn script, interest signals). `orgs` = allow-list; empty = everyone. */
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  orgs: text("orgs").array().notNull().default(sql`'{}'::text[]`),
  note: text("note"),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Phase 10 (R3): billing, SSO/SCIM/2FA                                */
/* ------------------------------------------------------------------ */

/** One billing account per org (plan 14.1). Stripe ids are null until checkout (H13). */
export const billingAccounts = pgTable("billing_accounts", {
  orgId: text("org_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** none | trialing | active | past_due | canceled | unpaid | incomplete */
  subscriptionStatus: text("subscription_status").notNull().default("none"),
  billingEmail: text("billing_email"),
  currentPeriodStart: ts("current_period_start"),
  currentPeriodEnd: ts("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  /** Credits included per billing period; the balance is reset to this (+ rollover) on renewal. */
  periodCredits: integer("period_credits").notNull().default(0),
  /** Share (0–100) of unused credits carried into the next period, capped at `rolloverCap` (0 = no cap). */
  rolloverPct: integer("rollover_pct").notNull().default(100),
  rolloverCap: integer("rollover_cap").notNull().default(0),
  /** Allow charges past zero up to `credit_balances.overage_limit`, billed on the meter. */
  overageEnabled: boolean("overage_enabled").notNull().default(false),
  lastResetAt: ts("last_reset_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Every Stripe webhook event we received (idempotency by Stripe's event id). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  orgId: text("org_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
  error: text("error"),
});

/** Credits sent to the Stripe meter (one row per report; `identifier` is Stripe's idempotency key). */
export const usageReports = pgTable(
  "usage_reports",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    identifier: text("identifier").notNull().unique(),
    credits: integer("credits").notNull(),
    ledgerRows: integer("ledger_rows").notNull(),
    status: text("status").notNull(), // SENT | FAILED | SKIPPED
    error: text("error"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("usage_reports_org_idx").on(t.orgId, t.at)],
);

/** Better Auth `twoFactor` plugin table (TOTP secret + backup codes, both encrypted by Better Auth). */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: ts("locked_until"),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

/** Better Auth `@better-auth/sso` provider (OIDC or SAML) bound to a workspace and an email domain. */
export const ssoProvider = pgTable("sso_provider", {
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  oidcConfig: text("oidc_config"),
  samlConfig: text("saml_config"),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  providerId: text("provider_id").notNull().unique(),
  organizationId: text("organization_id"),
  domain: text("domain").notNull(),
  domainVerified: boolean("domain_verified").default(false),
  createdAt: ts("created_at").defaultNow(),
  updatedAt: ts("updated_at").defaultNow(),
});

/** SCIM 2.0 bearer tokens, one or more per workspace (shown once, stored as SHA-256). */
export const scimTokens = pgTable(
  "scim_tokens",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    createdBy: text("created_by").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("scim_tokens_org_idx").on(t.orgId)],
);

/** SCIM User resources per workspace: the IdP's view (externalId, active) mapped to a user + membership. */
export const scimUsers = pgTable(
  "scim_users",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    externalId: text("external_id"),
    userName: text("user_name").notNull(),
    displayName: text("display_name"),
    active: boolean("active").notNull().default(true),
    role: text("role").notNull().default("member"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("scim_users_org_user_uq").on(t.orgId, t.userId),
    uniqueIndex("scim_users_org_username_uq").on(t.orgId, t.userName),
    uniqueIndex("scim_users_org_external_uq").on(t.orgId, t.externalId),
  ],
);

/**
 * Signal & classifier QA (plan 7.14): an operator's verdict on one talent signal (type) or news
 * signal (category). Corrections are applied to the signal; the verdicts form the human-labelled
 * sample used for precision reporting (H15).
 */
export const signalReviews = pgTable(
  "signal_reviews",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // TALENT | NEWS
    signalId: text("signal_id").notNull(),
    verdict: text("verdict").notNull(), // CORRECT | WRONG
    originalLabel: text("original_label"),
    correctedLabel: text("corrected_label"),
    note: text("note"),
    reviewer: text("reviewer").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("signal_reviews_kind_signal_uq").on(t.kind, t.signalId), index("signal_reviews_kind_at_idx").on(t.kind, t.at)],
);

/** Status page incidents (plan 15 Phase 10). Component health itself is computed live. */
export const statusIncidents = pgTable(
  "status_incidents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").notNull(), // investigating | identified | monitoring | resolved
    impact: text("impact").notNull(), // minor | major | critical
    components: text("components").array().notNull().default(sql`'{}'::text[]`),
    updates: jsonb("updates").$type<{ at: string; status: string; body: string }[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("status_incidents_created_idx").on(t.createdAt)],
);
