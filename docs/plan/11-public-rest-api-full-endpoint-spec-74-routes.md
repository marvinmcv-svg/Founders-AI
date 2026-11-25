## 11. PUBLIC REST API — FULL ENDPOINT SPEC (74 routes)

Base: `https://app.{{domain}}/api/v1`. Auth: `X-API-Key: <key>` (also accept `Authorization: Bearer`). JSON. **Pagination (decided): cursor-based** — `?limit=` (default 100, max 5,000) and `?cursor=` (opaque, returned as `next_cursor`); feeds also accept `*_after` date filters. Versioning: URL `v1`; breaking changes only in `v2`; deprecations announced with `Deprecation`/`Sunset` headers ≥ 90 days ahead. Rate limit: 15 req/s per key (token bucket in Redis; `429` + `Retry-After`; `X-RateLimit-*` headers). Errors: RFC 7807 problem+json. Idempotency-Key header on POST. OpenAPI 3.0 generated from Zod schemas (`zod-openapi`). Samples in cURL, Python, JavaScript for every endpoint.
**Credit price table (v2 — v1 had none; values are config in `packages/core/pricing.ts`, change freely):**

| Operation | Credits |
|---|---|
| Company / investor by ID or enrich (matched) | 1 per record |
| Person by ID or enrich (matched) | 1 per record |
| Verified email reveal | 5 per person (only when an email is returned) |
| Revenue / valuation / traction endpoints | 2 per record |
| Feed or search page | 1 per 100 records returned (rounded up) |
| Saved-search / list results | 1 per 100 records returned |
| AI search (`POST /search`) | 5 per query + page cost |
| Entity extraction | 1 per resolved entity |
| Resolve, taxonomy, list/search management, account, webhooks | 0 |

**Credits**: enrichment & by-ID = per matched result (miss = free and enqueues on-demand gathering); paginated feeds = per page; list/saved-search results = per result; resolve, list & search management = free. Every response includes `X-Credits-Charged` and `X-Credits-Remaining`.

| # | Method & path | Purpose | Credit |
|---|---|---|---|
| **Companies** ||||
| 1 | GET /companies/{companyId} | Full company record (250+ fields) | per match |
| 2 | POST /companies | Bulk enrich ≤ 50 by domain / LinkedIn / Crunchbase URL / name | per match |
| 3 | POST /companies/resolve | Identifiers → company IDs | free |
| 4 | POST /companies/search-by-text | Find company from incomplete info | per page |
| 5 | GET /companies/{id}/people | Key people & team members | per page |
| 6 | GET /companies/{id}/competitors | Similar companies & competitors with overlap (`?limit&min_overlap`) | per page |
| 7 | GET /companies/{id}/funding-rounds | Rounds | per page |
| 8 | GET /companies/{id}/acquisitions | As acquirer/target | per page |
| 9 | GET /companies/{id}/ipos | IPO data | per match |
| 10 | GET /companies/{id}/latest-revenue | Latest est. + reported revenue, growth 3m/6m/1y/2y, band, confidence | per match |
| 11 | GET /companies/{id}/latest-valuation | Valuation estimate + band + drivers | per match |
| 12 | GET /companies/{id}/revenue-history | Monthly P10/P50/P90 + anchors | per match |
| 13 | GET /companies/{id}/news-signals | News history | per page |
| 14 | GET /companies/{id}/investor-interest-signals | Interest on company | per page |
| 15 | GET /companies/{id}/traction | Time series metrics | per match |
| **People** ||||
| 16 | GET /people/{personId} | Full person (60+ fields) | per match |
| 17 | POST /people | Bulk enrich ≤ 50 by LinkedIn URL / name+company | per match |
| 18 | POST /people/resolve | Identifiers → person IDs | free |
| 19 | POST /people/by-email | Reverse email (work/personal) → person | per match |
| 20 | GET /people/{id}/email | Verified email(s) | per match |
| 21 | GET /people/{id}/talent-signals | Signals history | per page |
| 22 | GET /people/{id}/experience | Career history | per match |
| 23 | GET /people/{id}/investments | Angel/board activity | per page |
| **Investors** ||||
| 24 | GET /investors/{investorId} | Investor profile | per match |
| 25 | POST /investors/resolve | Identifiers → investor IDs (bulk ≤ 50) | free |
| 26 | GET /investors/{id}/portfolio | Portfolio companies | per page |
| 27 | GET /investors/{id}/funding-rounds | Rounds + co-investors | per page |
| 28 | GET /investors/{id}/investor-interest-signals | Interest it generates | per page |
| 29 | GET /investors/{id}/co-investors | Co-investor graph | per page |
| **Transactions** ||||
| 30 | GET /funding-rounds | Feed, filters `announced_date_after`, type, amount… | per page |
| 31 | GET /funding-rounds/{id} | One round | per match |
| 32 | GET /acquisitions | Feed | per page |
| 33 | GET /ipos | Feed | per page |
| **Signals** ||||
| 34 | GET /talent | Talent feed `signal_date_after`, type, score… | per page |
| 35 | GET /talent/{signalId} | One talent signal | per match |
| 36 | GET /investor-interest | Interest feed | per page |
| 37 | GET /investor-interest/{signalId} | One interest signal | per match |
| 38 | GET /revenue-signals | Revenue disclosures & shifts feed | per page |
| 39 | GET /news-signals | Global news feed | per page |
| **Search & AI** ||||
| 40 | POST /search | Plain-English search across all 8 products → `query_id`, items | per page |
| 41 | GET /search/{queryId}/results | Page through AI search | per page |
| 42 | POST /entities/extract | Text → resolved entities | per match |
| 43 | GET /taxonomy | Industries, verticals, business models, stages | free |
| **Saved searches** ||||
| 44 | GET /searches | List saved searches | free |
| 45 | POST /searches | Create (filter AST or NL) | free |
| 46 | GET /searches/{searchId} | Get | free |
| 47 | PATCH /searches/{searchId} | Update | free |
| 48 | DELETE /searches/{searchId} | Delete | free |
| 49 | GET /searches/companies/{searchId}/results | Results (`new_since_last_read=true`) | per result |
| 50 | GET /searches/people/{searchId}/results | | per result |
| 51 | GET /searches/investors/{searchId}/results | | per result |
| 52 | GET /searches/talent/{searchId}/results | | per result |
| 53 | GET /searches/investor-interest/{searchId}/results | | per result |
| 54 | GET /searches/transactions/{searchId}/results | | per result |
| **Lists** ||||
| 55 | GET /lists | All lists (`type=company|people|investor`) | free |
| 56 | POST /lists | Create | free |
| 57 | GET /lists/{listId} | Get meta | free |
| 58 | PATCH /lists/{listId} | Rename/visibility | free |
| 59 | DELETE /lists/{listId} | Delete | free |
| 60 | GET /lists/companies/{listId}/results | Items | per result |
| 61 | GET /lists/people/{listId}/results | Items | per result |
| 62 | PATCH /lists/companies/{listId} | Add/remove company IDs | free |
| 63 | PATCH /lists/people/{listId} | Add/remove person IDs | free |
| **Network** ||||
| 64 | GET /network/people | People your team knows (deduped, teammate IDs) | per page |
| 65 | GET /network/companies | Companies reachable, ranked by # connections | per page |
| 66 | GET /network/connection/{personId} | Who on team knows this person + strength | per match |
| 67 | GET /network/members | Teammates with connected sources | free |
| **Account** ||||
| 68 | GET /organization/credits | Balance & period usage | free |
| 69 | GET /organization/usage | Usage by endpoint/day | free |
| 70 | GET /me | Key/org info | free |
| **Webhooks** ||||
| 71 | GET /webhooks | List | free |
| 72 | POST /webhooks | Create (events: search.new_results, list.news, signal.talent, signal.interest, crm.sync) — HMAC-SHA256 signed | free |
| 73 | DELETE /webhooks/{id} | Delete | free |
| 74 | POST /webhooks/{id}/test | Send a signed test event | free |

> v2: the reference advertises "73 endpoints"; the number is marketing, **this table is the spec** (74 rows). Marketing copy shows the real count generated from the OpenAPI file at build time.

Company JSON shape: implement exactly the field groups described on the API page — `id, organization_name, organization_rank, primary_role, roles[], description, customer_focus, last_updated, tags[], industries[], sub_industries[], operating_status, highlights[], new_highlights[], regions[], founded_year, founders[], founder_count, employee_count, employee_count_range, revenue_estimate_usd, investors[], investor_count, patent_count, trademark_count, website{domain,url,domain_aliases[]}, hq{city,state,country,region}, contact{phone_number,email}, ipo[], growth_stage, funding{total_funding_usd,last_funding_usd,last_funding_date,last_funding_type,round_count,round_details[],post_money_valuation_usd}, web{visits,popularity_rank,top_country,bounce_rate(+3mo_change),pages_per_visit(+change),session_duration(+change),traffic_source,country_breakdown}, awards[], award_count, news[], reviews{g2,trustpilot,chrome_extensions}, socials{twitter,facebook,linkedin,itunes,googleplay,instagram,crunchbase}, organization_name_aliases, tagline, certifications[], customer_profile, traction_highlights, reported_clients[], founder_info[], acquisition{}, technologies[], it_spend, traction_metrics{web_visits|employee_count|linkedin_followers|twitter_followers:{latest,1mo,3mo,6mo,12mo:{value,change,percentage}}}, strategic_signal_ids[]`.

**Security (v2):** webhook target URLs validated (HTTPS only, no private/loopback/link-local IPs after DNS resolution, re-checked on every delivery), 10 s timeout, retries with backoff ×6, auto-disable after 24 h of failures; signatures `X-Signature: t=…,v1=HMAC_SHA256(secret, t + "." + body)`. API keys shown once, stored as SHA-256 hash, prefix visible.
**SDKs:** TypeScript (`packages/sdk`, generated from OpenAPI with `openapi-typescript` + thin client) in R1; Python SDK in R2.

**Docs site** (`apps/docs`): generated reference per endpoint (params, schema, examples, credit cost), interactive **console** ("Try it" with user's key), guides (quickstart, enrichment, saved-search feeds, webhooks, bulk), changelog, **`/llms.txt`**, **`/llms-full.txt`**, and "View as Markdown" on every page. API key request flow: dashboard → request → admin approval (≤ 1 business day) → 200 trial credits.
