## 5. GLOBAL SITE CHROME

### 5.1 Announcement bar (top, full width, dismissible per session)
"[New feature] is now live — Learn more about agents for private markets →" → links to `/agents`. CMS-driven text + link + on/off.

### 5.2 Header (sticky, blurred background after 8px scroll)

Left: logo → `/`. Center nav:

**Platform ▾ (mega-menu)**
- Top item: *Platform overview* — "The full platform at a glance" → `/platform`
- Group **Data**: Companies — "50M live startup profiles" · People — "700M talents mapped" · Investors — "350K investor profiles" · Transactions — "Every funding and M&A event"
- Group **Features**: Talent Signals — "Key moves and hiring trends" · Interest Signals — "Predict funding & M&A activity" · News — "Real-time market updates" · Revenue — "Modeled revenue, every company" · Valuation — "A live price between rounds" (→ `/revenue-valuation#valuation-estimates`) · Compare PitchBook — "Live signals vs deal records"
- Bottom promo banner: "New: Revenue & Valuation — A live price for every private company" → "Explore Revenue & Valuation"

**Agents** → `/agents` · **API** → `/api`

**Integrations ▾**
- Group **Connect**: All Integrations — "Browse every connection" · CRM — "Sync and enrich your data" (`/integrations#crm`) · Network Tracking — "See who knows whom" (`#network`) · Chrome Extension — "Data wherever you browse" (`#chrome`)
- Group **Delivery Methods**: API — "Build seamless integrations" · Bulk Data — "Ingest data anywhere" (`#api`) · MCP [New] — "Talk to your AI"

**Resources ▾** — Group **Read**: Blog — "Articles from the team" · Insights — "Research and the weekly newsletter"

**Pricing** → `/pricing`

Right: **Log in** (→ app) · **Get started** (black pill → `/contact`).
(Descriptions above are their menu micro-copy — rewrite in our voice, keep the same length.)

Mobile: hamburger → full-screen sheet with accordion groups; CTA pinned at bottom.

### 5.3 Footer
Columns:
- **Data**: Companies, People, Investors, Transactions
- **Features**: Agents [New], Revenue Modeling, Valuation Estimates, Talent Signals, Interest Signals, News
- **Integrations**: CRM, Network Tracking, Chrome Extension
- **Delivery Methods**: API, MCP [New], Bulk Data
- **Company**: Careers, Partners, Case Studies, Blog, Insights
- **Comparisons**: vs PitchBook, vs Harmonic, vs Grata, vs Sourcescrub, vs CB Insights, vs Crunchbase, vs Dealroom
- **Alternatives**: PitchBook alternatives, Harmonic alternatives, Grata alternatives

Bottom row: social (LinkedIn, X) · **"Ask AI about {{BRAND}}"** row of 5 deep links (ChatGPT `chatgpt.com/?prompt=`, Perplexity `perplexity.ai/search/new?q=`, Grok `x.com/i/grok?text=`, Claude `claude.ai/new?q=`, Google AI Mode `google.com/search?udm=50&aep=11&q=`) each pre-filled with a URL-encoded prompt asking the assistant to summarise our site · © {{year}} {{Legal entity}} · Privacy Policy · Privacy Rights · Terms & Conditions.

### 5.4 Floating demo pill (bottom-right, all marketing pages)
Avatar stack of 3 sales reps + "Book a demo" + small line "N booked today / N demos this hour" → `/contact`. Count from `GET /api/public/demo-stats` (reads booking provider; cached 60s). Hide count when 0 or unavailable. Collapses to icon on mobile; hides when the footer CTA is in view.

### 5.5 Shared closing blocks (reused on almost every page)
1. **Logo wall** "Trusted by N+ firms" (marquee) — under every hero.
2. **Testimonial marquee** — two rows, each card: bold lead sentence + rest of quote, avatar, firm logo, name, role, optional "Case Study →".
3. **Press logos** row (Bloomberg/Forbes/Sifted-style — only real press we've earned).
4. **Final CTA band** — big H2 + one line + "Book a demo" + DemoPill-style avatar stack.
5. **"Agents" promo block** and **"MCP" promo block** — same component reused on Companies/People/Investors/Transactions/News pages with a page-specific chat example.
6. **"API" promo block** — 4 columns (Core data / Enrichment / Signals / Network) of EndpointPills + footnotes ("50 lookups per bulk call", "Deduped across teammates") + a code sample tab.
