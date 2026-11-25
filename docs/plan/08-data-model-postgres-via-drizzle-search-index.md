## 8. DATA MODEL (Postgres via Drizzle) & SEARCH INDEX

IDs: public, stable, prefixed, 24-hex (e.g. `com_…`, `per_…`, `inv_…`, `trx_…`, `sig_…`) — identical across app, API, MCP and bulk files.

```text
-- v2: Better Auth owns user/session/account/organization/member/invitation/apiKey tables;
-- we extend them. A user may belong to MANY orgs (workspace switcher), so role lives on membership.
organizations(id, name, logo, plan, seats, mcp_overage_enabled, thesis jsonb, created_at)
users(id, email, name, timezone, created_at)
memberships(org_id, user_id, role ADMIN|MEMBER|VIEWER, agent_instructions, created_at)  -- PK(org_id,user_id)
credit_balances(org_id PK, balance, period_start, period_end)   -- ledger is source of truth; this is a cache

companies(id, name, aliases[], domain, domain_aliases[], tagline, description, founded_year,
  hq_city, hq_state, hq_country, hq_region, operating_status, growth_stage, customer_focus,
  business_models[], sector_id, industry_ids[], sub_industry_ids[], tech_vertical_ids[], ecosystem_ids[],
  employee_count, employee_range, rank, highlights[], new_highlights[], tags[],
  total_funding_usd, last_funding_usd, last_funding_date, last_funding_type, round_count, post_money_valuation_usd,
  patent_count, trademark_count, technologies[], it_spend, certifications[], customer_profile, traction_highlights,
  contact_email, contact_phone, socials jsonb, reviews jsonb, ipo jsonb, acquisition jsonb,
  embedding vector(EMBEDDING_DIM), provenance jsonb, deleted_at, created_at, updated_at)
-- provenance: { "<field>": { "source": "sec_form_d|registry|website|provider_x|model", "fetched_at": ts, "redistributable": bool } }
company_metrics_daily(company_id, metric, date, value)  -- partitioned by month; ClickHouse in R3
company_people(company_id, person_id, title, department, seniority, is_founder, start, end, is_current)
company_competitors(company_id, competitor_id, overlap_score 0-10, reason, computed_at)
company_estimates(company_id, month, revenue_p10, revenue_p50, revenue_p90, revenue_type ARR|Revenue,
  valuation_p10, valuation_p50, valuation_p90, confidence LOW|MEDIUM|HIGH, drivers jsonb, model_version)
revenue_disclosures(id, company_id, amount_usd, type, period, source_url, publisher, published_at, verified_by, status)
awards, news_items(id, url, publisher, title, published_at, body_hash)
news_signals(id, company_id, news_item_id, category, summary, score 0-5, is_major, figures jsonb)

people(id, full_name, first, last, headline, bio, location, country, linkedin_url, x_url, github_url,
  avatar_url, seniority, years_experience, highlights[], followers, connections, embedding, ...)
person_experience(person_id, company_id, company_name, title, department, start, end, is_current)
schools(id, name, domain, country, logo_url, tier)
person_education(person_id, school_id, degree, field, start, end)
person_emails(person_id, email, type work|personal, status verified|catch_all|unknown, source, checked_at)

investors(id, name, type, domain, hq, aum_usd, check_min, check_max, target_stages[], geographies[], sectors[],
  investments_count, exits_count, leads_count, follow_on_rate, unicorn_count, highlights[], person_id null for angels)
funding_rounds(id, company_id, type, amount_usd, currency, announced_date, pre_money, post_money, source_urls[])
round_investors(round_id, investor_id, is_lead)
acquisitions(id, acquirer_id, target_id, date, amount_usd, status, source_urls[])
ipos(id, company_id, date, exchange, ticker, share_price, valuation_usd, raised_usd)

talent_signals(id, person_id, type NEW_COMPANY|NEW_ROLE|PROMOTION|SEARCHING|OUT_OF_STEALTH|DEPARTURE,
  status STEALTH|HR|LIVE, score 1-10, summary, signal_date, new_company_id, prev_company_ids[], sources jsonb)
interest_signals(id, target_company_id, target_person_id, investor_id, investor_type, score 1-10,
  signal_date, source_type, funding_context jsonb)

taxonomy_nodes(id, kind SECTOR|INDUSTRY|SUB_INDUSTRY|TECH_VERTICAL|ECOSYSTEM|BUSINESS_MODEL, name, parent_id, slug, path ltree)
company_taxonomy(company_id, node_id, confidence, source MODEL|HUMAN)
fx_rates(date, currency, usd_rate)   -- all amounts converted at announcement date
lists(id, org_id, owner_id, name, entity_type COMPANY|PERSON|INVESTOR, visibility, deleted_at, created_at)
list_items(list_id, entity_type, entity_id, added_by, status, custom_fields jsonb, note, added_at)
saved_searches(id, org_id, owner_id, name, product, filter_ast jsonb, nl_query, visibility, alert_cadence, channels jsonb)
search_result_snapshots(search_id, entity_id, first_seen_at)
search_reads(search_id, user_id|api_key_id|mcp_client_id, last_read_at)
org_statuses(org_id, id, label, color, order)          -- custom status set per workspace
entity_status(org_id, entity_type, entity_id, status_id, updated_by, updated_at)
likes(org_id, user_id, entity_type, entity_id)   hides(org_id, user_id, entity_type, entity_id)
notes(org_id, entity_type, entity_id, author_id, body, deleted_at, created_at)
notifications(id, org_id, user_id, kind, payload jsonb, read_at, created_at)
digest_runs(id, org_id, user_id, cadence, sent_at, item_count)

crm_connections(id, org_id, provider, auth jsonb(encrypted), pull_config, push_config, schedule, status)
crm_records(org_id, provider, external_id, entity_type, entity_id, owner, stage, last_activity, open_deals, raw jsonb)
crm_sync_log(id, org_id, direction PULL|PUSH, entity_count, status, error, at)

network_sources(id, org_id, user_id, provider LINKEDIN_CSV|GMAIL|OUTLOOK|GCAL|MSCAL, status, last_sync)
network_edges(org_id, user_id, person_id, strength, last_interaction_at, source)

agent_threads(id, org_id, user_id, title, visibility, created_at)
agent_messages(id, thread_id, role, content jsonb, tool_calls jsonb, sources jsonb, created_at)
skills(id, org_id null(=curated), owner_id, slug, name, description, steps jsonb, output_format, shared bool)
skill_runs(id, skill_id, thread_id, schedule_cron null, status, started_at, finished_at)
agent_artifacts(id, thread_id, kind TABLE|MEMO|CHART, title, content jsonb, created_at)

api_keys(id, org_id, user_id, name, prefix, hash, scopes[], status PENDING|ACTIVE|REVOKED, last_used_at, created_at)
credit_ledger(id, org_id, delta, reason, endpoint|tool, request_id, at)
usage_events(org_id, actor_type, actor_id, surface API|MCP|APP|EXT|AGENT, operation, matched bool, credits, latency_ms, request_id, at) -- partitioned
webhooks(id, org_id, url, secret, events[], active)
exports(id, org_id, kind, format, status, file_url)
bulk_deliveries(id, org_id, datasets[], fields jsonb, sink S3|GCS|SNOWFLAKE, cadence, last_run)
dsar_requests(id, email, type ACCESS|DELETE|OPT_OUT, entity_id, status)
audit_log(id, org_id, actor, action, target, at)
platform_stats (materialized view: counts per dataset, signals/day, etc.)
```

**Tenancy enforcement (v2):** Drizzle connects with a privileged role, so Postgres RLS alone does not protect us. Every org-scoped query goes through `packages/core/repo/*` functions that require an `OrgContext` argument and add `org_id = ctx.orgId`. RLS policies are still enabled as defence-in-depth, with the app setting `app.org_id` per transaction. A test suite tries cross-org reads on every repo function and must fail them.

**Scale note:** 700M people rows with embeddings will not fit a single small Postgres. R1–R2 target ≤ 10M companies / 50M people; plan for Citus or sharding by entity type in R3.

**OpenSearch indices**: `companies`, `people`, `investors`, `talent_signals`, `interest_signals`, `funding_rounds`, `acquisitions`, `ipos`, `news_signals`. Denormalise everything filterable (taxonomy IDs incl. ancestors, metrics + growth %s for 1/3/6/12m, highlights, investor IDs, alumni company IDs, org-scoped data is NOT in the index — CRM/list/network filters are applied via `terms` lookups from Postgres ID sets). Sync via a transactional **outbox table** → BullMQ indexer worker (no Debezium). Rank = composite score (growth momentum, funding, web, signals) recomputed nightly.
