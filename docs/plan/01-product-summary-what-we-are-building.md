## 1. PRODUCT SUMMARY — WHAT WE ARE BUILDING

A **private-markets intelligence platform** for VC, PE, M&A and GTM teams. Users search every private company, person, investor and transaction; follow live **signals** (talent moves, investor interest, revenue, news); monitor watchlists; push results to their CRM; and delegate research to an in-app **AI agent**. The same data is sold through a **REST API**, a hosted **MCP server**, a **Chrome extension** and **bulk warehouse delivery**.

### 1.1 Surfaces (all must be built)

| # | Surface | URL / package | Notes |
|---|---|---|---|
| 1 | Marketing site | `www.{{domain}}` | 17 page types, Next.js, MDX/CMS |
| 2 | Product web app | `app.{{domain}}` | Browse + Agent modes |
| 3 | Public REST API | `app.{{domain}}/api/v1/*` | 73 endpoints, API keys, credits |
| 4 | API docs | `api.{{domain}}` | OpenAPI 3.0, interactive console, `llms.txt`, `llms-full.txt`, Markdown per page |
| 5 | MCP server | `mcp.{{domain}}/mcp` | 29 tools, OAuth sign-in, 100 free calls/day/user |
| 6 | Chrome extension | Chrome Web Store | Side panel on any site + inline LinkedIn enrichment |
| 7 | Insights / blog | `insights.{{domain}}` + `/blog` | Case studies, weekly newsletter |
| 8 | Help center | `/help` section inside `apps/docs` (Fumadocs) | MCP install guide, MCP pricing article |
| 9 | Bulk delivery | S3 / GCS / Snowflake | CSV + Parquet, full snapshot + daily incrementals |

### 1.2 Headline numbers the platform is designed around (theirs — ours will start smaller)

- 50M+ companies (250+ data points each) · 700M+ people (60+ data points) · 350K+ investors · 1M+ transactions (150+/day)
- 1,000+ talent signals/day (≈30K/week) · 7,000+ investor-interest signals/week · 500+ verified revenue signals/day · news from 60,000+ sources
- API: 73 endpoints, 15 req/s per key, 5,000 records/page, 50 lookups per bulk call, 200 trial credits, misses are free
- MCP: 29 tools (24 read, 5 write), 100 free calls/day/user

Our UI must display these as **live values from our own database** (a `platform_stats` view refreshed hourly), never hard-coded. Marketing pages render them with a floor-rounding formatter ("1.2M+"). **Exception:** numbers *inside product mocks* are fixture data and are allowed to be static, because they illustrate the UI, not our coverage.
