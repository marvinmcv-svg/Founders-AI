## 6. MARKETING SITE — PAGE-BY-PAGE SPEC

Conventions for this section:
- ⚠️ **Rule 8 applies to everything below.** Quoted headings, labels, CTA lines and menu descriptions are *reference paraphrases* so you can identify sections. Implement each as a copy key (`<page>.<section>.<slot>`), shipped as `[TODO-COPY …]` until the copy team supplies text. Structure, component and data requirements are binding; wording is not.
- **Intent** = what the copy must communicate (copywriters write the final words).
- **Mock** = the real `packages/ui` component wrapped by `packages/mocks`, with **fictional fixture data** (invented company/person names, favicons we generate). Never use real people's photos in mocks.
- Every page gets: unique `<title>`, meta description, OG/Twitter image (generated with `next/og`), canonical URL, JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage` where FAQs exist, `Article` for comparisons/blog).

### 6.1 Home `/`

| # | Section | Intent | Components / mock |
|---|---|---|---|
| 1 | Hero | H1: find the deal of the decade before anyone else. Sub: unrivalled insight into private markets, used by N teams across VC, PE, M&A, GTM. CTA "Book a demo". | **Hero app mock**: full AppWindow with left sidebar (logo, notification badge "3", tabs *Browse / Agent*, Quick Search ⌘K, Searches (2), Lists → My CRM (CRM icon) · My Network (LinkedIn icon), Companies → Company DB, People → People DB · Talent Signals, Investors → Investor DB · Interest Signals, Transactions → Funding Rounds · Acquisitions · IPOs; workspace switcher "Acme Corp." at bottom). Main: breadcrumb "Companies / Database · 50M+ companies", Export button, saved-view tabs "All Companies", Clear Search, Save Search, Sort by Rank, Status, Add Filter, active filter chip `Growth Stage is Pre-seed / Seed` (count badge 1). Table columns: Company (favicon+name) · Tagline · Growth Stage · HQ Location · Employee Count · 3m Δ · Web Visits · 3m Δ · Total Funding Amount. ~14 rows. |
| 2 | Logo marquee | Social proof | LogoMarquee (12 logos, duplicated track) |
| 3 | Agent + API split hero cards | Show the agent and the API side by side | Left: Agent mock with prompt "Map the fastest-growing competitors of {company}" + composer chips `@ # /`, tabs *Agent / MCP*. Right: **API log terminal** mock — dropdown "logs-acme-app ▾", range "24H", metric `sum(signals_processed) 1,247`, streaming log lines with glyphs (`»` cron, `›` HTTP, `λ` edge fn, `✓` done) e.g. cron talent-scan, `GET /v1/talent?signal_date_after=…` 200 96ms, worker enrich-queue, PATCH lists, edge fn signals-webhook 202, "cycle complete · 0 errors". Link "Build on top of our data → Explore API". |
| 4 | Problem statement | Deals get crowded by the time you see them; we get you there first. Para: private markets run on information asymmetry; most databases are stale; we refresh live. | Text block |
| 5 | Four-pillar sticky tabs **Data · Signals · Sourcing · Monitor** (preview) | Each pillar = small card set: (a) "One workspace for the whole market" + link Explore the platform + 3 SignalCards (Stealth / Growth / Product categories, times now / 22 min / 1 hr); (b) "Ask anything. Agents do the work" + agent mock showing steps "Searching…", "Reading investor interest", "Ranking by raise likelihood" → result "21 companies ranked by confidence · Sources attached · saved to a list"; (c) "Every data point, one call away" + `GET /companies/{companyId}` JSON snippet | Sticky tab bar with scroll-spy |
| 6 | **Data** section | Most complete platform: N companies, people, investors, transactions. | People DB mock (columns: Person · Current Title · Company · Seniority · Location · Yrs Exp · Highlights chips "+4"). Then 4 dataset cards: Companies (firmographics & funding, growth metrics, revenue & valuation estimates, 250+ data points) · People (profiles & career, education & network, investment activity, founder highlights) · Investors (check sizes & AUM, portfolios & exits, follow-on rates, curated fund profiles) · Transactions (funding rounds, acquisitions, IPOs, 150+ per day) |
| 7 | **Signals** section | Talent + interest signals surface movers first. | Talent Signals table mock (Person · Signal Date · Signal Type · Signal Summary · Signal Status · Signal Score x/10 · Current Experience). Sub-card "Meet founders on day zero" (1,000+/day) with **person signal card** (previous roles list with logos, avatar, "Stealth Founder", one-line thesis, "New Company Signal" + summary). Sub-card "See which investors are circling" (7,000+/week) with 3 interest SignalCards (VC Interest / PE Interest / CVC Interest). |
| 8 | **Sourcing** section | Be the reason your fund wins; N% of firms triage faster. | Agent app mock (sidebar: New Chat, Personalization, Skills; history grouped Today/Yesterday with 6 sample thread titles; header "Agent / New chat", visibility "Private"). 3 feature cards: Zero in on your thesis (alumni, spinouts, founder networks, accelerator cohorts) · Deep, logical taxonomy (industries, tech verticals, business models, stages, 250+ points) · Source with agents |
| 9 | **Monitor** section | Monitor every move in real time. | Saved Searches table mock (Search · Product · New Results "+128" · Created · Owner) with 8 rows + floating "Trending" card (person, "{Company} headcount is up 41% this quarter", now) |
| 10 | Testimonials row | 4 testimonial cards with Case Study links | TestimonialCard ×4 |
| 11 | **Workflow** section | Fits your CRM, network, browser, stack. Link "See all integrations". | "My CRM" companies mock (filter chip `[CRM icon] Is In CRM`, columns: Company + CRM badge + network count badge · Tagline · Growth Stage · HQ · Founders (initials avatar + "+2") · Business Models · Industry (› breadcrumb) · Tech Vertical · Total Funding · Last Funding Date). 6 sub-cards: **CRM always current** (two-way sync Salesforce/Attio/Affinity/HubSpot…, pull setup) with sync animation; **Team network** (LinkedIn connected "5,639 connections synced", "{Company} hired from your network", "Marco/Phil/Alex is connected" chips); **On every page** (Chrome extension mock over a browser tab: company card with rank, description, HQ, founded, B2B/SaaS chips, raised, Key People, Team size ▲%); **Bulk** (AWS S3, Google Cloud, Snowflake tiles); **API** (cURL + JSON typing); **MCP** (Claude/Cursor/ChatGPT/OpenCode tiles, link "More on MCP") |
| 12 | **Agents** section | Put agents on it — plans work, runs tools, answers with sources. Link "More on Agents". | Agent mock again (different threads) |
| 13 | Closing proof | "Powering N teams" + paragraph (data layer, real-time, exclusive signals in your tools) + Book a demo | Text + CTA |
| 14 | Testimonial marquee | 8–10 quotes | TestimonialMarquee |
| 15 | Logo wall "Trusted by N+ firms" | | LogoMarquee |
| 16 | Floating demo pill | | DemoPill |

### 6.2 Platform `/platform`
Hero (H1 "one workspace for the whole market", sub, Book a demo, hero app mock) → logo wall → then 7 eyebrowed sections:

1. **Discovery** — "Find the right deals top-down, backed by data."
   - 4 dataset tiles listing field highlights (Investors: name, check size & AUM, follow-on rate…; Companies: name, industry & stage, growth metrics, 250+ more; People: full name, position, career history, 60+ more; Transactions: round & amount, investors & leads, announced date, predicted deals…). Tabs "Verticals / Industries".
   - Agent mock: prompt "Find stealth founders who left {Big payments co} after 5+ years" → steps (searching talent signals, filtering tenure, creating list "Payments mafia — stealth") → "Done" + result sentence.
   - **Searches that stay live** — Workspace/Searches mock "12 saved searches", sort by Created, a row with "Signal · New Company · 32 new results · now".
   - **Lists your team works from** — Workspace/Lists "18 lists", sort by Name, "3,481 connections".
   - Copy: nested taxonomy helps find where to deploy capital.
   - **Non-obvious founder trends** — ticker of talent signals (Promotion·CTO / New Role·VP Eng / Searching / New Company·Stealth / Out of Stealth·Voice AI / Stealth·AI Agents). Link More on Talent Signals.
   - **Technology inflection points** — filter chips (Customer Focus = B2B, Tech Vertical = AI Agents and Process Copilots) + composer "Find B2B companies building AI agents…".
   - **Firm-level filters** — chips: Location = United States, Business Models = SaaS, Headcount Highlights = Headcount Surge, Web Visits – Growth (%) ≥ 25 over 3 Months. Link Explore Companies.
   - **Ecosystem mapping** — nested filter builder mock: Ecosystem (OR) Stablecoins and Payments / Payment Infrastructure & Orchestration / "5 more verticals"; Industry Financial Services › Financial Technology; Company filters (AND) General: Operating Status = Active, Bootstrapped; Sector; Team: Company Size 1–10 → "21 matching companies".
   - **Trends** — ranked table Company / Headcount growth (+45%, +38%…).
   - "Discover with Agents" (ecosystem map answer table Company/Growth Stage) and "Discover over MCP" (Claude mock answer).
2. **Sourcing & Deal Origination** — "Build and manage pipeline with the right context."
   - Filter chips (Banking and Payment Infrastructure APIs, Late Stage, Matches 142).
   - **People breakdowns** (profile card: title, company, tenure, "Education, network & more"), link Explore People.
   - **Team breakdowns** (162 people; Engineering 52% / Sales 21% / Product 14% / Ops 13% bar; "+18 hires in 90 days").
   - **Firmographics** (Stage, Founded, HQ, Headcount, Total raised, Business model, "+245 more data points").
   - **Contact details** (People DB row with verified email reveal).
   - **LinkedIn connections** (team network), link More on Network Tracking.
   - CRM sub-block: **Pipe lists into your CRM** (list "EU defense long-list · 74 companies" → push), **Enrich and match records** (Website, Last round fields filling), **Spot gaps and deep dive** (filters CRM Owner = Phil, Deal Stage = Diligence, Last Activity 90 days). Link Explore CRM integrations.
3. **Monitoring** — "Watchlists built on signal."
   - Match card ("Thesis Match — {Company} crossed 45 employees — roll-up profile fit").
   - **Monitor curated companies** (Watchlist "Portfolio companies · 28 companies · Team").
   - **Monitor curated people** ("Founders to watch · 12 people · Private").
   - **Growth signals over time** (multi-series chart Web visits / App downloads / Followers, Jan–Oct, "+38% YoY").
   - **Thesis matches over time** ("Fintech rails — Series A · Matches 12").
   - **Revenue & valuation estimates** (Disclosed vs Revenue est. "$2.1M / mo", Valuation est. "$240M", +64%) → link.
   - **Cadenced summaries & alerts** (segmented Daily / Weekly / Real-time; "Your daily digest 07:00").
   - **News** (scored headlines list with 0–100 scores) → link More on News Signals.
4. **Signals** — "Your edge in discovery and deal origination." Live interest/revenue feed (Index Ventures 2m "Researching {Co}", "Revenue est. +64%"…). Cards: Talent signals (1,000+ today), Revenue signals ("$1.4M / mo +38%") → link, Investor & competitor signals (7-day chart, 7,000+ this week) → link.
5. **Data** — tabbed Companies / People / Investors / Transactions with a description panel per tab.
6. **MCP & Agents** — two cards: Agents in-app (instructions, skills, web context) and MCP in your harness.
7. **API** — API promo block (Section 5.5 #6).
8. **Comparison** — "Your edge is {{BRAND}}": table "{{BRAND}} vs the next best provider for each dataset", 4 rows visible + "Show 4 more datasets" expander, footnote on methodology.
9. Closing CTA + testimonials.

### 6.3 Companies `/companies`
1. Hero: H1 find private companies matching your thesis; sub 250+ data points; companies DB mock (same as home).
2. **Companies** overview — 4 cards: Firmographics to financials · Growth metrics · Revenue & valuation estimates · Signals & news (stats 50M+, 250+, 60,000+ sources).
3. **Company Data** — "Understand any company, 250+ data points deep." **Full company profile mock** with tabs **Overview · Business · Financials · Team · Traction Metrics · Reviews · News · Competitors**: rank, domains + aliases, founders, investors ("+2 more"), funding totals, revenue est., valuation est. (~), headcount chart, web traffic (visits, Δ), review rating, news items with dates, competitor table (Company · Overlap · Funding), key metrics (5.35x, 160%, 93%…). Link Docs.
4. **Company Signals** — "Signals no one else tracks": interest signal cards; **live revenue feed** list (5 companies with revenue figures); **confidence-band revenue card**. Link Explore revenue & valuation.
5. **Similar Companies** — "Map the entire competitive landscape": logo grid of 10 competitors, scoring 0–10 overlap; **Benchmark card** (Funding, Employees, Revenue est., Valuation est.). Two testimonials.
6. **News** — "The pulse of global intelligence": scanning-status widgets (News & media 40K+ outlets, X & social, Press releases, Company filings) + cards: Embedded everywhere · Filter signal from noise · 60,000+ verified sources · Structured intelligence.
7. **Founders & Network** — founder profile card + network card ("3 team connections"); links Explore people data, Explore network intelligence.
8. **API** — endpoints: `POST /companies/resolve`, `GET /companies/{companyId}`, competitors, latest-revenue, etc. + JSON.
9. **Agents** ("Ask anything about N companies") · 10. **MCP** · 11. Closing CTA "Ready to unlock live market intel?" + press logos + testimonials.

### 6.4 People `/people`
1. Hero: H1 find founders and follow their next move; People DB mock (10 rows; columns Person, Current Title, Company, Seniority, Location, Yrs Exp, Highlights).
2. **People** — largest people dataset in venture, real time: 3 stat callouts (700M+, 1,000+ signals/day, AI + human verified) + 4 H3 cards.
3. **People Data** — "Understand any profile, 60+ data points deep": **person profile mock** (avatar, title, company logos, "Get Email" button, connections/followers/experience counts, bio, highlight chips, Education (university logo), Signals ("Talent 2 — started a New Company · Stealth AI Startup · 8/10"), Experience timeline with tenures) + 9 category tiles: Profile Data, Career History, Education, Network, Talent Signals, Social Links, Investment Activity, Highlights, News & Mentions.
4. **Filter by highlights crafted for investors** — 3 profile cards + highlight filter dropdown (Serial Founder, Prior Exit, Prior IPO, Major Tech Experience, Fortune 500 Experience, Hyper Connector, Influencer, Top University, etc.).
5. **Exhaustive founder data** — founder card with "Read more…".
6. **Network intelligence** — company card + 3 team connections. Link.
7. **Talent Signals** — saved searches table (Search, Product, New Signals, Created, Owner) + stealth card. Link.
8. **Every move typed and scored / Every source covered** — signal types (New Company, New Role, Promotion, Searching) and source chips (X, LinkedIn*, News, Company Filings, Press Releases, Company Sites, GitHub, Proprietary). *Only list sources we legally use.*
9. **API** — Find person ID, Get person by ID, Get person email, Get person talent signals, Get people saved search results + JSON.
10. Agents ("Ask anything about N people", threads: Stealth founder sweep, Portfolio hires digest, Founder outreach drafts, Board moves pull) · 11. MCP (prompt "Ex big tech founders") · 12. CTA + testimonials.

### 6.5 Investors `/investors`
1. Hero: H1 research investors and track deal activity; Investor DB mock (columns: Investor · Investor Type · Highlights · # Investments · # Exits · Target Investment Stages · HQ Location).
2. 4 pillar cards: Fund details to check sizes · Track records & analytics · Real-time interest signals · Context on every company (350,000+, 7,000+).
3. **Investor Data** — composer + filter chips (Fund details, Check sizes, Lead investments, Portfolio breakdown, Exit patterns, Follow-on rate, Target stages, Geographies, AUM, Unicorn count); **angel/investor profile card** (chart, deals stats, latest deals); **"Most relevant backers" list with fit scores** (96, 94, 91…); **company funding card** (tabs Overview/Funding/Investors; total raised, last round, valuation, rounds breakdown).
4. **Interest Signals** — "Predict future rounds and acquisitions": saved trackers table (Search · Target · New Signals · Total · Owner — rows: Interest from Tier-1 Funds, Buyout Firms, CVC Interest Tracker, Hot Signals 90d, Corporate Partnership Predictor, Hottest Founders 90d, Growth Funds, Angel Interest — AI Infra); notification card; 8 source types; signal attributes; observed engagements (avatars, 3d/6d/11d); "{Fund} likely to lead Series A" card; **forecast card** (92% confidence, total raised, "interest from 5+ VCs").
5. API (`GET /investor-interest`, `/companies/{id}/investor-interest-signals`, `/investors/{id}/investor-interest-signals`, `/searches/investor-interest/{searchId}`) · 6. Agents · 7. MCP ("Who's circling {Co}") · 8. CTA.

### 6.6 Transactions `/transactions`
1. Hero: H1 every deal tracked, seed to IPO; Funding Rounds mock (columns Company · Investment Type · Raised (USD) · Announced Date · Investors; sort by Announced Date; "1M+ rounds").
2. Overview with "150+ per day" + 4 H3s: Funding rounds · Mergers & acquisitions · IPOs & valuations · Predicted deals.
3. **Deal Data** — scanning widgets (Company filings · Registries, Regulatory filings · Exchanges, Press releases · Wire services, News & socials · 40K+ outlets).
4. **Stop reacting, start predicting** — 3 predicted-deal cards with "6 wks early / 4 wks early / 3 wks early" badges. Link Explore interest signals.
5. **Deal data embedded in profiles** — company mock tabs Overview/Transactions/Investors, filter All/Rounds/M&A/IPOs, "6 transactions", table Deal · Date · Amount · Lead investor (+N).
6. 150+/day CTA · 7. **Every source covered** chips · 8. **Every deal carries** — Round type (Seed–Series J), Amount (USD), Valuation (pre & post), Investors (with lead flag).
9. API (`/funding-rounds`, `/acquisitions`, `/ipos`, `/companies/{id}/funding-rounds`, `?announced_date_after=`) · 10. Agents · 11. MCP · 12. CTA.

### 6.7 Talent Signals `/signals/talent`
Hero (H1 discover stealth founders through career signals; Talent Signals table mock with statuses Live/HR/Stealth and scores 10/10…) → **Overview** (earliest talent feed, delivered wherever you work; activity chips with times; H3s: Signal types · Signal dates and scores · Summary and profile links · Target by industry, vertical or company; "~136K" stat) → **The Feed** (New founders · Stealth activity · Job changes · Months early) → **Spinouts** ("spot the next mafia": table # · New company · Founder · Founded; logo row of alumni-founded companies; 2 case-study links) → **Alumni Trackers** (avatars + company favicons; Workspace/Searches "8 saved searches" with alumni trackers per big company and +N new results) → **API** (`GET /talent`, `/people/{personId}/talent-signals`, `/searches/talent/{searchId}`, `/searches/talent/{searchId}/results`) → CTA "Reach the founder before the round exists".

### 6.8 Interest Signals `/signals/interest`
Hero (interest signals for rounds still taking shape; 6 interest cards with person/company, tags, investor logos, Score 9/10; controls Export, All Interest Signals, Sort by Signal Date) → **Interest Signals** (trackers table + VC Interest card; stats: new signals daily, 8 source types, funding context on every signal) → **The Feed** → **Momentum** ("watch a round form": timeline Jul 14…Aug 12 with signal strength 1–10; "Round Forming" card listing 6 firms with rising scores 3→9) → **Interest Trackers** (8 saved per-fund trackers) → **API** → CTA.

### 6.9 News `/news`
Hero (company news distilled into signal; news cards for 6 companies) → **News Signals** (60K+ sources, AI summary on every article, scored 0–5 with majors flagged; scanning widgets; sub-features: one signal per company mention, what's new in one line, classified for action) → **Meaningful Updates** ("five kinds of update": Revenue updates, Profitability, Traction milestones, Funding rounds, Deals & M&A; filter targets: your portfolio, competitors of portcos, co-investors' portfolios, watchlists & CRM book) → **Lists & Alerts** ("your portfolio's newsroom": funding news card + saved searches table with +N) → **Competitive Intel** (competitor set + Benchmark card) → **API** (`/companies/{id}/news-signals`, `/companies/resolve`, `/companies/{id}/competitors`, `/lists/companies/{listId}/results`) → **Agents** ("an analyst that reads everything": portfolio digests with sources, rival news summarised, only what's new since last read) → **MCP** → double CTA.

### 6.10 Revenue & Valuation `/revenue-valuation` (anchor `#valuation-estimates`)
1. Hero — company card (rank "1 of N viewed", Add to List, Push to CRM, stage, one-liner, city, founded, B2B SaaS, employees) with profile tabs; **Estimated revenue card**: "$9M ARR, +19× in 12 months, 90% range $6M–$12M, Confidence Medium" + line chart with band; verified disclosure items (source · month · figure); **Valuation estimate card** ("Stacked on revenue · funding · stage", last priced round, "re-rated every month on 250+ live signals").
2. **Revenue & Valuation** — 4 cards: Anchored to disclosures · Modeled between anchors · Honest confidence bands · Valuation stacked on revenue.
3. **Coverage** — "every company, garage to decacorn": table Company · Estimate (P10–P90 + median) · Confidence (Low/Medium/High) · N disclosures; 3 sub-cards (Pre-launch & bootstrapped <$1M–$5M · Growth & scale-up $10M–$250M · Late-stage & pre-IPO $250M–$1B+).
4. **Anchored** — animated timeline: band widens where data thin, snaps tight at each disclosure node.
5. **Modeled, Not Copied** — comparison of one company's revenue figure across 4 other providers vs ours (with 90% band and the actual reported figure); toggle Revenue / Valuation; chart + 7 verified disclosures. *Use only figures we can source; label others' numbers with date & source.*
6. **Valuation** (`id="valuation-estimates"`) — valuation timeline with priced-round markers, card "Valuation estimate $440M · 5.6× since {date} · 90% range · Modeled".
7. **The Model** — quantile regression P10/P50/P90 chart; stat cards (Median, 90% range, re-rated monthly); **driver breakdown** (SHAP-style: Est. revenue +380%, Funding history +64%, Investor quality +24%, HQ country +7%, Company age +2%; legend "pulls down / pushes up").
8. **Delivery** — "revenue is a filter, not a footnote": estimate card (5 verified anchors), in-app filter mock (Est. revenue $5M–$50M), API `GET /companies/{id}/latest-revenue` JSON (`est_revenue_usd`, `latest_revenue_reported_usd`, `revenue_type`, `est_revenue_growth_3m_pct/6m/1y/2y`), bulk file list (`estimates_YYYY-MM-DD.parquet/.csv`).
9. CTA "Put a number on every private company".

### 6.11 Agents `/agents`
1. Hero — H1 "your AI analyst for private markets"; rotating 4-word pill ticker (Equip with skills · Personalize your agent · Plugged into datasets · Enrich with web search); **composite mock**: Agent instructions card (sample persona text), Shared skills card (3 avatars, `/market-map` shared by Phil, `/diligence-brief` by Marco, `/weekly-brief` by Alex), CRM logo, Web sources card (4 publications with categories), skill chips (`/company-brief /thesis-screen /competitor-map /fund-intel`), and the Agent app (sidebar Today/Yesterday/Last week/Earlier; empty state with mascot sprite, "Meet your agent", typed prompt).
2. **Agents** — 4 cards (Equip with skills · Personalize · Plugged into datasets · Web search).
3. **Datasets** — composer "Who…" + 4 dataset counters; 9 use-case cards each with 3 bullets: Sourcing, Diligence, Market maps, Monitoring, Outreach, CRM enrichment, Competitive intel, Talent, Reporting (copy the *capabilities* listed in Section 10.6).
4. **Skills** — Agent mock + 3 cards: **Create your own skills** (New skill form: Name `/d…`, Steps list, Save skill), **Share skills with your team** (3 shared skills with owners), **Curated skills** (Skill library: `/market-map`, `/diligence-brief`, `/weekly-brief`, `/founder-check`).
5. Testimonials.
6. **Context** — "agents work from your context": CRM-connected agent mock ("Attio connected", thread "Series A — Top Performers"); **Agents learn how you work** (instructions textarea + Save); **Web search** (elapsed timer "0s" animation).
7. **MCP** promo (Claude-style mock with model selector).
8. CTA "Ask your agent first. Walk in with the brief." + testimonials + final line.

### 6.12 API `/api`
1. Hero — H1 "your programmatic edge to private markets" (word swap animation); sub; CTAs Book a demo + **View documentation** (→ docs site); endpoint 4-column block; logo marquee.
2. **Coverage** — 4 stat tiles (companies/250+ points, people/60+, investors, transactions).
3. **Endpoints and enrichment** — "73 REST endpoints behind one API key" + limits list (charged per matched result, unresolved not charged, bulk calling, 15 req/s, 5,000 records/page) + **endpoint sample explorer**: left list of 11 samples (Company enrichment, People enrichment, Investor signals, Talent signals, Revenue signals, Email lookup, Text search, Saved searches, Similar companies, Key people, Search with incomplete info) → right: full JSON response + cURL/Python/JavaScript tabs + "Docs" link.
4. **Use cases** — where the API runs (CRM enrichment, sourcing dashboards, internal dashboards, AI agents, data warehouses, saved searches polled as feeds) + 4 jobs (Enrichment, Search, Signals, Workflow automation) + **usage-mix bar charts** (what teams build first; how lookups are keyed: Domain / LinkedIn URL / Email; % of lookups in bulk). *These must come from our own telemetry (`usage_events`) once we have it — hide until then.*
5. **Data and delivery** — included datasets list + "where API data lands" + "how often feeds are pulled" charts (same rule).
6. **Capabilities** — 8 cards: Market signals via API · Plain-English search · Build searches programmatically · Revenue & valuation on demand · Query your team's network · Misses never cost a credit · Bigger pages, fewer round-trips · Built to be read by agents (`llms.txt`, `llms-full.txt`, Markdown per page).
7. **Comparison table** "{{BRAND}} API vs other platforms" (rows grouped: What's included / Querying & workflows / Scale & freshness / Docs & agents) — dated, sourced.
8. **Getting started** — included-with-key list + 3 numbered steps (Request key → Test in console → Integrate). "Teams migrated from" logo row (only if true).
9. CTA "Build on the best API for private markets" + docs link.

### 6.13 MCP `/mcp`
1. Hero — H1 "make your AI agent fluent in private markets"; sub (29 tools, 100 free calls/day); 4 dataset cards; client switcher tabs (Claude, Cursor, ChatGPT, Windsurf, OpenCode) that re-skin the chat mock.
2. 3-item ticker (works with Claude/ChatGPT/Cursor · 100 free calls/day · 29 read & write tools) + 4 cards: Live data behind every answer · Read and write (writes ask confirmation) · Net-new tracking (since last read) · Tools that chain themselves.
3. **Tools** — "29 tools. Each one does a whole job." 6 category cards, each with an animated tool-call mini mock (input → tool name → JSON args → result chips): Resolve & search (4) · Company intelligence (10) · People (3) · Investors (3) · Lists (5) · Saved searches (4). "Free" badges on free tools.
4. **Workflows** — Search in plain English · Track with saved searches (new-item list with "New" badges) · Build target lists (**permission dialog mock**: "Claude wants to run create_list · Write · Deny / Allow once") · Deep dive on anything.
5. **Connect** — copyable server URL `https://mcp.{{domain}}/mcp`, client logos, link to installation guide; 3 steps (Add connector → Sign in → Ask).
6. **Usage** — 100 free calls/day · essentials never cost credits · scales with team credits (admin toggle). Link per-tool rates.
7. **Agents** promo · CTA.

### 6.14 Integrations `/integrations` (anchors `#crm`, `#network`, `#chrome`, `#api`)
1. Hero with integration icon grid (Claude, Cursor, ChatGPT, Attio, Affinity, Salesforce, HubSpot, Snowflake, Chrome).
2. **Delivery** — ticker (6 CRM integrations · one API · 29 MCP tools) + 4 cards (CRM sync both ways · Network intelligence · API & bulk · Agents & browser).
3. **Integrations directory** — tabbed: CRM (Attio, Affinity, Salesforce, HubSpot, Pipedrive, Airtable) · Network & alerts (LinkedIn, Chrome extension, Slack, Email) · AI clients (native Agents, Claude Desktop, Claude Code, ChatGPT, Cursor, Windsurf, OpenCode, any MCP client) · Warehouse & bulk (Snowflake, S3, GCS, CSV export) · Developer & automation (REST API, Webhooks, Zapier, Saved search sync). "Need another one? Ask us".
4. **CRM** `#crm` — "Pushed to CRM" toast; connection card (Attio · Connected); **Pull Setup** (Companies "5,535 matched & visible", People "604 matched & visible"); **Pull Sources**; **Push Setup**; "Your whole CRM in context"; **Filter by your CRM** (CRM owner, Lifecycle stage, Last activity, Open deals); **Pull, push, automate** (match previews before pull, bulk push, scheduled enrichments, push/pull activity log).
5. **Network Tracking** `#network` — 4 cards: Sync every source (LinkedIn, Gmail, Outlook, calendar) · Team-wide visibility · Real-time signals · Relationship mapping.
6. **Chrome Extension** `#chrome` — "View profiles on any site" (push to CRM, add to list, like) with browser mock; "Enriched data directly on LinkedIn" (company page mock with injected "View on {{BRAND}}" button and Add to list).
7. **API & Bulk** `#api` — endpoint block + 5 highlighted endpoints with explanation tabs (AI search `POST /search`, Find company ID `POST /companies/resolve` (free), Enrich person by email, Saved search results feed, Network companies) + JSON + bulk tiles.
8. MCP promo · CTA.

### 6.15 Pricing `/pricing`
Three plan columns, **no prices shown** — each "Get pricing" → `/contact`:
- **Platform** (seat): companies, people, investors, transactions, live signals (talent/day, revenue/day, interest/week, news sources), revenue & valuation estimates, Agents, Chrome extension, Integrations (Slack, email, Zapier, webhooks, CSV), CRM sync (6), Network tracking, MCP (100 free calls/day/user).
- **API**: one plan every endpoint, signals as endpoints, plain-English search, saved searches as feeds, misses free, 5,000/page, 15 rps, 50/bulk, 200 free credits (approval in 1 business day), llms.txt docs.
- **Bulk data**: full snapshots, modular snapshots, S3/GCS/Snowflake, CSV/Parquet, daily incrementals, estimates included (bands + confidence + anchors), one stable ID everywhere, scoped per project.
- **FAQ** accordion (7): What a Platform seat includes · Do I need a seat for the API (yes) · How API credits work (metered per billing period; enrichment & by-ID per matched result, miss free; paginated feeds per page; list/saved-search results per result) · What Bulk includes/how delivered · How fresh (real-time; daily incrementals) · Does MCP cost extra (no; 100/day; essentials free; admin can allow overage on credits) · Who do I talk to (rep avatars). Link "Ask us anything".
- Logo wall + testimonials + CTA.

### 6.16 Contact / Demo `/contact`
Two-column. Left form **"Request a demo"**: First name* · Last name* · Business email* (reject free-mail domains) · Company (optional) · Firm type* (select: VC, PE, Growth equity, Corporate VC / Corp Dev, M&A advisory / Investment bank, Family office, Angel, Accelerator, GTM / Sales team, Other) · AUM* (select: Not applicable, <$50M, $50–250M, $250M–1B, $1–5B, $5B+) · Phone (optional) · Submit. On submit: create lead in our CRM (HubSpot), enrich with our own API, route by firm type/AUM, then show **Cal.com** booking inline. Right: H2 value statement + auto-scrolling vertical marquee of ~17 benefit bullets (each "Bold label — short explanation") covering every feature in this doc + compact logo grid.

### 6.17 Other pages
- **Partners** `/partners` — hero (H1 partner with us, avatars of partner-program faces, Become a partner) → logo wall → "Multiple ways to partner" (stats + partner type cards: Technology, Solution, Content creator) → "Why partner" (6 numbered benefit cards, links to features, testimonials) → **application form** (First name, Last name, Business email, Partnership type select: Technology partner / Solution partner / Consultant / Content creator / Other, Partnership idea textarea, Submit application) → closing CTA.
- **Careers** `/careers` — mission, values, perks, open roles pulled from ATS (Ashby/Greenhouse API), role detail pages.
- **Blog** `/blog` + **Insights** (`insights.` subdomain or `/insights`): MDX/CMS, tags (incl. `case-studies`), author pages (`/authors/{slug}`), newsletter signup (weekly), RSS, related posts, reading time, OG images.
- **Case study template**: customer logo, quote, challenge / approach / results, metrics, product features used, CTA.
- **Comparison template** `/comparisons/{brand}-vs-{competitor}` (7 pages): Overview table (What it is / Best at / Best fit for) → Which to choose (3 cards: Choose us / Choose both / Choose them) → Feature comparison in 8 grouped tables (*See the whole market*: who's in the data, private company profiles, people with career histories, people before they found a company, stealth/pre-launch, investor profiles, fund performance & LPs, public company data, advisors, transactions, venture rounds, M&A & IPOs, round valuations, PE buyouts & debt, cap tables, web/app traction, reviews, patents, financial statements, revenue estimates, valuation estimates; *Know what's changing*: job changes, stealth founders, team growth, funding, news, patents, investor interest; *Search*: advanced filters, plain-language search, similar companies, people search, filter by signals, exclude CRM, AI screening, sector taxonomy, emerging sectors, market maps; *Decide what deserves attention*: profiles, founder backgrounds, growth charts, competitors, funding history, comps, market size, exit predictions, AI research assistant, analyst research, benchmarks; *Keep targets in view*: saved searches, lists, custom fields & statuses, alerts by type; *Reach the right people*: emails, phones, team network, meeting prep; *Work as a team*: share lists/searches, shared notes, team activity, project workspaces; *Let AI do the work*: reusable AI workflows, AI actions; *Fit into your tools*: CRM integrations, upload & match lists, push to CRM, scheduled refresh, CRM data in tool, browser extension, Excel/PowerPoint add-ins, mobile app, API, bulk delivery, MCP, AI assistant connectors) → Key differences (4 cards) → Pricing table → FAQ → **Methodology** (sources, date, Contact us) → logos + CTA. Article metadata: author, published/modified time.
- **Alternatives template** `/comparisons/{competitor}-alternatives` (3 pages): ranked list of alternatives with short pros/cons, who each fits, comparison table, FAQ.
- **Legal**: Privacy Policy, Privacy Rights (GDPR/CCPA request form — data subjects can request access/deletion of their profile; **essential for a people-data business**), Terms & Conditions, plus a **Data Processing Addendum** and **Opt-out page** ("Remove my profile").
- **404** and **500** pages in brand style.
