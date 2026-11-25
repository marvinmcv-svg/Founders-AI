## 7. THE PRODUCT APP (`app.{{domain}}`) — IA & EVERY SCREEN

### 7.1 Shell
- **Left sidebar** (collapsible): logo + notifications bell with unread badge; mode switch **Browse | Agent**; **Quick Search ⌘K**; **Searches** (count); **Lists** with pinned system lists **My CRM** (CRM logo) and **My Network** (LinkedIn icon) + user lists; **Companies** → Company DB; **People** → People DB, Talent Signals; **Investors** → Investor DB, Interest Signals; **Transactions** → Funding Rounds, Acquisitions, IPOs; bottom: workspace switcher (org name + logo), settings, help, user menu.
- **Agent mode sidebar**: New Chat · Personalization · Skills · thread history grouped Today / Yesterday / Last week / Earlier · per-thread visibility (Private / Shared with team).
- **Top bar per view**: breadcrumb `Section / View` + total count ("50M+ companies"), **Export** (CSV; respects credits/limits), view tabs (saved views e.g. "All Companies"), **Clear Search**, **Save Search**, **Sort by** (Rank default), **Status** filter (user-set statuses: e.g. New, Reviewing, Contacted, Pass, In CRM), **Add Filter**, active filter chips with count badge.

### 7.1b Access, onboarding & states (missing in v1)
- **Access model:** demo-led. Sales creates the workspace (admin console) or an invite link; users join by email invite (magic link or Google/Microsoft SSO). No public self-serve signup in R1, but `/signup?invite=` flow exists. API-only users still need a seat (pricing FAQ).
- **First-run onboarding (4 steps, skippable):** role & firm type → thesis (sectors, stages, geographies, check size) → suggested saved searches created from the thesis → invite teammates. Thesis also seeds agent personalization (R2).
- **Every view has designed empty, loading (skeleton), error (retry + support link) and no-permission states.** No blank screens.
- **Responsive policy:** app is desktop-first (≥ 1024 px full experience); 768–1023 px: sidebar collapses, grids scroll horizontally; < 768 px: read-only profiles, lists, digests and agent chat; grids show a card list.
- **Credits UX:** any action that costs credits (export, email reveal) shows the cost before confirming and the remaining balance after.

### 7.2 Global Quick Search (⌘K)
Command palette searching companies (name, domain, aliases), people (name, LinkedIn URL, email), investors, lists, saved searches, skills, and commands ("Create list", "Go to Talent Signals"). Typeahead < 100ms from OpenSearch `search_as_you_type`; recent items; keyboard nav; enter opens profile; ⌘↵ opens in new tab.

### 7.3 Database views (shared "EntityGrid" component; 9 products)
Products: **companies, people, investors, talent_signals, interest_signals, funding_rounds, acquisitions, ipos, news_signals** (news is filterable inside company context and lists).
Grid features: virtualised rows; column chooser (all fields of the entity, grouped); column resize/reorder/pin; per-column sort; row checkbox + bulk actions (Add to list, Push to CRM, Export, Set status, Like/Hide); row hover quick actions; favicon/avatar cells; Δ% coloured cells with sparkline on hover; "—" null; CRM badge & network-connections badge on entity names; infinite scroll + "Jump to"; URL-encoded state (filters, sort, columns) so any view is shareable; "Showing N results" with exact count up to 10k then "10k+".

**Default columns**
- Companies: Company · Tagline · Growth Stage · HQ Location · Founders · Employee Count · 3m Δ · Web Visits · 3m Δ · Business Models · Industry · Tech Vertical · Total Funding (USD) · Last Funding Date · Est. Revenue · Est. Valuation · Rank
- People: Person · Current Title · Company · Seniority · Location · Yrs Exp · Highlights · Education · Talent signals
- Investors: Investor · Type · Highlights · # Investments · # Exits · Target Stages · HQ · AUM · Check size · Follow-on rate
- Talent Signals: Person · Signal Date · Signal Type · Signal Summary · Signal Status · Signal Score · Current Experience
- Interest Signals: Target (company/person) · Investor(s) · Signal Type (VC/PE/CVC/Angel/Strategic) · Score 1–10 · Signal Date · Funding context · Tags
- Funding Rounds: Company · Investment Type · Raised (USD) · Announced Date · Investors (lead flagged) · Post-money
- Acquisitions: Acquirer · Target · Date · Amount · Status
- IPOs: Company · Date · Exchange · Ticker · Share price · Valuation · Raised

### 7.4 Filter builder (core differentiator — build carefully)
- **Filter AST** (in `packages/core/filters`): `Group{op: AND|OR, children: (Group|Condition)[]}`; `Condition{field, operator, value, timeframe?}`. Operators by type: text (contains, is, is not, starts with), enum/taxonomy (is any of, is none of, includes children), number (=, ≠, ≥, ≤, between), percent-growth (≥ X over 1/3/6/12 months), date (before, after, within last N days), boolean, exists/not exists, geo (country/region/city, radius optional), relation (has investor in…, alumni of company…, in list…, in CRM / not in CRM, CRM owner, deal stage, last activity).
- UI: "Add Filter" opens searchable field picker grouped (General, Sector, Team, Funding, Growth, Web, Social, Reviews, Revenue & valuation, Signals, Highlights, CRM, Network, Ecosystem); nested groups with AND/OR toggle; chips summarise conditions; live result count as you edit (debounced 300ms).
- **Natural-language → filters**: text box "Describe what you're looking for" → LLM converts to AST (validated against schema) → shown as editable chips. Same converter powers API `POST /search` and MCP `search`.
- Compile AST → OpenSearch DSL (`packages/search`). Unit-test every operator.

**Taxonomy** (seed & maintain in `taxonomy_*` tables): Sector › Industry › Sub-industry (≈ 20 / 150 / 600) · Tech Vertical (≈ 400, e.g. "AI Agents and Process Copilots", "Build, Test, CI/CD and Release", "Banking and Payment Infrastructure APIs", "Vector Databases & AI Data Stacks") · Ecosystem (curated groupings of verticals, e.g. "Stablecoins and Payments") · Business Model (SaaS, Marketplace, Product Sales, Subscription, Licensing, Transaction fees, Advertising, Services, Hardware) · Customer Focus (B2B, B2C, B2B2C, B2G) · Growth Stage (Pre-seed/Seed, Early, Growth, Late, Exit/Public) · Operating Status (Active, Acquired, Closed, IPO) · Bootstrapped flag · Company Size bands.
Classification pipeline: LLM classifier over description + website text → taxonomy IDs with confidence; human QA queue for low confidence.

**Highlights** (computed flags, recomputed daily)
- Company: `headcount_surge`, `strong_headcount_growth`, `strong_web_traffic_growth`, `strong_social_growth`, `top_tier_investors`, `no_recent_funding`, `recently_funded`, `yc_backed`/accelerator, `new_highlights` (changed in last 30d).
- People: Serial Founder, Prior Exit, Prior IPO, Major Tech Experience, Fortune 500 Experience, Hyper Connector (network size percentile), Influencer (follower percentile), Top University, Stealth, Repeat co-founders, Ex-{company} alumni.
- Investor: Tier-1, Lead investor, Active (deals last 12m), Unicorn backer, High follow-on rate.

### 7.5 Saved Searches (`/searches`)
Any grid state → "Save Search" (name, product, visibility Private/Team, alert cadence: Off / Real-time / Daily / Weekly, channels: in-app, email, Slack, webhook, CRM auto-push). Table: Search · Product · New Results (+N since last viewed, per user) · Created · Owner. Backend: search re-run on schedule & on ingestion events; store `search_results_snapshots` (entity IDs + first_seen_at) to compute **"new since last read"** per reader (`search_reads` table). Also NL saved searches.

### 7.6 Lists (`/lists`)
Company / People / Investor lists; shared or private; columns customisable; custom fields & statuses per list; notes per row; import CSV (match by domain / LinkedIn URL / name → preview matches before import); bulk push to CRM; list news feed ("portfolio newsroom"); "Map competitors of everyone in list". System lists: **My CRM** (all CRM-matched records), **My Network** (companies/people reachable via team connections), **Liked**.

### 7.7 Company profile (`/companies/{id}`)
Header: logo, name, rank ("Rank 418,316"), one-liner, chips (HQ, founded, B2B/B2C, business model, stage, total raised), domains + aliases, socials, actions **Add to List · Push to CRM · Like · Hide · Share · Export**, CRM status badge, network connections ("3 team connections") with avatars, "Ask agent about this company".
Tabs:
1. **Overview** — description, key metrics tiles (headcount + Δ, web visits + Δ, total funding, last round, est. revenue w/ band, est. valuation w/ band), highlights chips, founders & key people, latest signals (talent, interest, news, revenue), investors (lead flags), similar companies preview.
2. **Business** — taxonomy (sector › industry › vertical), business models, customer focus, customer profile, reported clients, technologies (tech stack), IT spend, certifications (SOC 2, ISO 27001, GDPR, HIPAA, B Corp), patents & trademarks counts, awards, traction highlights.
3. **Financials** — funding rounds table (date, type, amount, investors, lead, post-money), total funding, valuation history chart with priced-round markers, **revenue estimate chart with P10–P90 band and disclosure anchors**, valuation estimate + driver breakdown, acquisitions (as acquirer/target), IPO data.
4. **Team** — headcount over time; department mix (Engineering/Sales/Product/Ops…) and seniority mix over time; hires/departures last 90 days; key people list with talent signals; founder cards.
5. **Traction Metrics** — time series 1m/3m/6m/12m for web visits, popularity rank, bounce rate, pages/visit, session duration, traffic sources, country breakdown, employee count, LinkedIn followers, X followers, Instagram, app store ratings/installs (iOS/Android), Chrome extension users.
6. **Reviews** — G2 (products, rating, count), Trustpilot, Chrome Web Store, App Store, Google Play.
7. **News** — scored news signals (0–5, majors flagged), categories (revenue, profitability, traction, funding, M&A), AI one-line summary, source link, filters.
8. **Competitors** — ranked competitor set with overlap score 0–10 and reason; comparison table (Company · Overlap · Funding · Headcount · Est. revenue · Growth); "Add all to list"; Benchmark card.

### 7.8 Person profile (`/people/{id}`)
Header: avatar, name, headline, current role & company, location, socials, followers/connections counts, highlight chips, **Get Email** (reveal; costs credits; verified/catch-all status), Add to list, Push to CRM, team connections ("Phil is connected"). Sections: About/bio · Signals (talent signals with score/type/date/summary) · Experience timeline (company logos, titles, tenure, "Founder" flags) · Education · Investment activity (angel deals, board seats) · Network (shared connections) · News & mentions · Similar people.

### 7.9 Investor profile (`/investors/{id}`)
Header: logo, name, type (VC, PE, CVC, Angel, Family office, Accelerator, Strategic), HQ, AUM, fund details, check size range, target stages, geographies, sectors. Sections: Stats (investments, exits, leads, follow-on rate, unicorns) · Portfolio (filterable grid) · Rounds participated with co-investors · Exit patterns · Partners/team · Interest signals generated by this investor (what they're circling) · Fit score vs a given company ("most relevant backers").

### 7.10 Signal feeds
- **Talent Signals** grid + card view; signal detail drawer (person mini-profile, previous roles, summary, score, status Stealth/HR/Live, sources).
- **Interest Signals** grid + card view; "Round forming" momentum view per target (timeline of engagements, strength 1–10 per firm); forecast card (probability of raise within 90 days, likely lead).
- **Revenue signals**: disclosures + significant estimate shifts.
- **News**: global feed and per list.

### 7.11 Notifications & digests
In-app bell (grouped by search/list), email digests (Daily 07:00 local / Weekly Monday), real-time alerts (email, Slack, webhook). Digest = new results per saved search + list news + network moves ("{Company} hired from your network").

### 7.12 Agent mode — see Section 10.

### 7.13 Settings
Profile · Workspace (name, logo, members, roles Admin/Member/Viewer, seats) · Integrations (CRM, LinkedIn/Gmail/Outlook/Calendar, Slack, Zapier, Webhooks) · API keys (request, approve, rotate, scopes, usage charts) · MCP (allow overage on credits toggle, per-user usage) · Credits & billing · Agent personalization (workspace defaults) · Statuses & custom fields · Data privacy (export my data, delete account) · Audit log.

### 7.14 Admin (internal) `admin.{{domain}}`
Entity editor & merge tool (dedupe companies/people), taxonomy manager, classifier QA queue, disclosure (revenue anchor) review queue, signal QA, data-subject requests (GDPR/CCPA), API key approval queue, customer accounts & credits, feature flags, ingestion job monitor.
