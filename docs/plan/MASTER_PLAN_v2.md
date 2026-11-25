# MASTER BUILD PLAN v2 — Private-Markets Intelligence Platform
### Feature-for-feature rebuild of tryspecter.com (marketing site + full product + API + MCP + Agents + Chrome extension)

> **Hand-off document for the coding agent.** v2 = audited revision of v1 (changelog in Section 20).
> **First action for the agent:** split this file into `/docs/plan/00-…md` … `/docs/plan/20-…md` (one file per section, text unchanged) and create `/AGENTS.md` from Section 19. From then on load only the plan files the current phase needs — never the whole plan at once.
> Work release by release and phase by phase (Sections 0B and 15). Every phase ends with the acceptance checks listed for it. Nothing is "done" until its checks pass and the evidence is written to `/docs/progress/phase-N.md`.
> **Precedence when two parts seem to conflict:** Section 0 (rules) > Section 0A (locked decisions) > Section 0B (scope) > Section 15 (phases) > everything else. If a conflict remains, log it in `/docs/decisions.md`, pick the simpler option and continue.

- **Reference target:** https://www.tryspecter.com (researched 25 Nov 2026)
- **Reverse-engineering toolkit:** REA — Reverse Engineer Anything — https://github.com/morluto/rea (`npx rea-agents setup`)
- **Working brand name in this doc:** `{{BRAND}}` (placeholder — pick a real name before launch; see Section 0)
- **Prepared by:** Product, Engineering, UX/UI, Marketing & Copy leads (combined plan)

---

## TABLE OF CONTENTS

0. Ground rules (read first)
0A. Locked technical decisions (no "or" choices left)
0B. Release scope — what ships in R1 / R2 / R3
0C. Human-only tasks & inputs the agent cannot do
0D. Global config & placeholders
1. Product summary — what we are building
2. Phase 0 recon with REA — exact workflow
3. Tech stack & monorepo layout
4. Design system (tokens, type, components, motion)
5. Global site chrome (announcement bar, header mega-menus, footer, floating demo pill)
6. Marketing site — page-by-page, section-by-section spec (17 page types)
7. The product app — information architecture & every screen
8. Data model (Postgres schema) & search index
9. Data acquisition & signal pipelines (companies, people, investors, transactions, talent, interest, news, revenue/valuation)
10. AI layer — Agents, Skills, Personalization, AI search
11. Public REST API (74-route spec) + docs site with llms.txt
12. MCP server (29 tools) + usage metering
13. Integrations — CRM sync (6), Network tracking, Chrome extension, Slack/Email/Zapier/Webhooks, Bulk delivery (S3/GCS/Snowflake)
14. Billing, credits, seats, admin, security & compliance
15. Build phases, milestones & acceptance criteria
16. Testing & QA strategy
17. Copy & marketing deliverables
18. Final "nothing missed" master checklist
19. AGENTS.md + kick-off prompt for the coding agent
20. v1 → v2 audit changelog

---

## 0. GROUND RULES (READ FIRST)

These keep the project shippable and legally safe. They change *how* we clone, not *what* we clone — every feature still gets built.

1. **Clone the features, structure, layout, interactions and UX — not the brand.** Use our own name, logo, icon set and illustrations. Do not copy their logo files, OG images, avatars or `specter-*` assets.
2. **Copy: same structure and message intent, our own words.** Section 6 gives the *intent* of every headline and paragraph. The copy team rewrites each one (Section 17). Do not paste their marketing text verbatim — it's copyrighted, and Google penalises duplicate content anyway.
3. **No borrowed social proof.** Their customer logos (Index, Bessemer, NVIDIA, Goldman…), testimonials and case studies belong to *their* customers. We build the **components** (logo marquee, testimonial carousel, case-study cards) and fill them with our own real customers, or hide them until we have some. Same for "400+ teams", "97% of firms…": only publish numbers we can prove.
4. **No fake live counters.** The floating "Book a demo · 7 demos this hour" pill must read a real count from our booking system (or show no number).
5. **REA scope:** use REA only on the **public marketing site** and on our own builds. Do **not** reverse-engineer their logged-in app (`app.tryspecter.com`), their private API or their Chrome extension — that breaks their Terms. We rebuild the product from the public descriptions in this doc.
6. **Data must be licensed or public.** No scraping LinkedIn or other sites whose terms forbid it. Section 9 lists legitimate sources.
7. **Comparison pages** ("{{BRAND}} vs PitchBook") must be factual, dated, sourced and reviewed by a human before publishing.
8. **Every quoted phrase in Sections 5 and 6 is a reference label, not copy.** Quotes, headings and micro-copy there paraphrase the reference site so you can tell sections apart. They must never ship. All UI text comes from copy keys (`t("home.hero.h1")`) in `/content/copy/en.json`. Until the copy team fills a key, its value is the visible placeholder `[TODO-COPY home.hero.h1]`. A CI check fails the production build if any `TODO-COPY` value remains.
9. **Recon artifacts stay out of the repo.** REA captures and exported scripts contain the reference site's code. Store them in `~/recon-raw/` (outside git). Commit only our own notes (`/recon/*.md`, `tokens.json`, our screenshots for internal reference in a private bucket). Never copy their JS, CSS, SVGs or images into our code.
10. **Redistribution rights decide what we can resell.** Licensed data often may be shown in-app but not resold through an API or bulk files. Every field carries `provenance.source` and `provenance.redistributable` (Section 8). API, MCP, exports and bulk delivery filter out non-redistributable fields automatically.
11. **Stop and ask, don't guess, for anything in Section 0C.** Mock it behind an interface, mark it `BLOCKED-HUMAN` in `/docs/progress/blocked.md`, and move to the next unblocked task.

---

## 0A. LOCKED TECHNICAL DECISIONS

v1 left many "X or Y" choices. A coding agent must not choose mid-build. These are final unless a human changes them in `/docs/decisions.md`.

| Concern | Decision | Notes |
|---|---|---|
| Package manager / monorepo | pnpm + Turborepo | Node 22 LTS |
| Web framework | Next.js 15 (App Router), React 19, TypeScript `strict` + `noUncheckedIndexedAccess` | `apps/www`, `apps/app`, `apps/docs` |
| API server | **Hono** on Node, mounted at `app.{{domain}}/api/v1` via Next.js rewrite | Same Zod schemas generate OpenAPI (`@hono/zod-openapi`) |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) in `packages/ui` | Storybook 8 |
| Motion | `motion` (Framer Motion) | |
| Charts | **Recharts** (simple) + **visx** only for the confidence-band and driver charts | |
| Tables | TanStack Table v8 + TanStack Virtual | |
| URL state | nuqs | |
| Auth | **Better Auth** with `organization`, `twoFactor`, `apiKey` and SSO plugins | Multi-org membership (a user can belong to several workspaces) |
| Database | **PostgreSQL 16** (managed: Neon or Supabase — pick by region/price; code must be provider-agnostic) + `pgvector` | ORM: **Drizzle**; migrations via drizzle-kit |
| Time series (R1–R2) | **Postgres partitioned tables** (`company_metrics_daily`, monthly partitions) | Move to ClickHouse only when > 1B rows (R3+) |
| Usage/analytics events | Postgres `usage_events` (partitioned) in R1; ClickHouse in R3 | |
| Search | **OpenSearch 2.x** | Local: docker. Prod: managed provider chosen by human (H2); code uses the standard client only |
| Queue / jobs | **BullMQ + Redis 7**; cron via BullMQ repeatable jobs | Temporal is not used |
| ML service | Python 3.12, FastAPI, LightGBM, scikit-learn, SHAP, `uv` for deps | `apps/ml` |
| LLM | Anthropic Claude through Vercel AI SDK; provider wrapped in `packages/agent/llm.ts` so it can be swapped | Embeddings: one model, dimension set in config (`EMBEDDING_DIM`) |
| CMS | **MDX in repo** (`/content`) via Contentlayer-style loader (use `velite`) | No external CMS in R1 |
| API docs | **Fumadocs** + OpenAPI | `llms.txt` generated at build |
| MCP | `@modelcontextprotocol/sdk` TypeScript, Streamable HTTP, OAuth 2.1 (Better Auth as authorization server) | `apps/mcp` |
| Extension | WXT + React (MV3) | R3 |
| Email | Resend + React Email | |
| Billing | Stripe (seat subscriptions + credit packs) | |
| Booking | Cal.com (embed + API for counts) | |
| Bot protection | Cloudflare Turnstile on all public forms | |
| Cookie consent | Our own consent banner + Google Consent Mode v2; analytics load only after consent in EU/UK | |
| Analytics | PostHog (product + marketing), consent-gated | |
| Errors / tracing | Sentry + OpenTelemetry | |
| Hosting | Vercel (www, app, docs); **Docker images** for api, mcp, workers, ml, deployable to Railway or Fly.io (human picks, H2) | One environment each: `local`, `staging`, `production` |
| Testing | Vitest, Playwright, Schemathesis, k6, axe | |
| Lint/format | ESLint (flat) + Prettier; Ruff for Python | |

### Local development (must work with one command)
`pnpm dev:up` → `docker compose` starts Postgres+pgvector, Redis, OpenSearch, Mailpit, MinIO (S3); then `pnpm db:migrate && pnpm db:seed && pnpm dev`. `.env.example` lists every variable with a comment. `pnpm db:seed` loads the **synthetic seed dataset** (Section 9.0) so every screen works without any paid data provider.

### Engineering conventions
Conventional commits; one feature per branch/PR; PRs < 600 changed lines where possible; every PR updates tests and `/docs/progress`. No `any`, no `@ts-ignore` without a linked issue. All money stored as integer USD cents + original currency + FX date. All timestamps UTC `timestamptz`; display in user timezone. Soft-delete (`deleted_at`) for user-created objects; hard-delete only via DSAR workflow.

---

## 0B. RELEASE SCOPE — WHAT SHIPS WHEN

v1 had no scope cut, so "build everything" was the only instruction. That is months of work for a team. Build in three releases. **Do not start R2 work until R1 is accepted by a human.**

| Release | Goal | Includes | Explicitly NOT included |
|---|---|---|---|
| **R1 — Credible demo** | A site you can sell from + an app that works on real-looking data | Global chrome, Home, Platform, Companies, People, Investors, Transactions, Pricing, Contact, Partners, Legal, cookie consent · App: auth/orgs/invites, onboarding, ⌘K, grids for Companies/People/Investors/Funding Rounds, filter builder (AST + NL), company/person/investor profiles (Overview, Business, Financials, Team, News, Competitors tabs), Lists, Saved Searches + email digest · Seed + one public-data pipeline (SEC Form D + registries + company websites) · Revenue estimate **v0 heuristic** · API: core read endpoints + resolve + lists/searches + keys + credits + docs | Agent, MCP, CRM sync, network, extension, bulk, interest signals, ML revenue model |
| **R2 — Signals & AI** | The differentiators | Talent signals, News signals, Acquisitions/IPOs grids, Traction & Reviews tabs, revenue/valuation **ML model**, Agents + Skills, MCP server, remaining API endpoints, webhooks, Slack alerts, Talent/News/Revenue-Valuation/Agents/API/MCP marketing pages, comparison & alternatives pages, blog/insights | Interest signals (unless legal sign-off), CRM, extension, bulk |
| **R3 — Workflow & scale** | Fit into customer stacks | CRM ×6, network tracking, Chrome extension, Zapier, bulk delivery, Integrations page, Interest signals (behind flag), ClickHouse migration, SSO/SCIM, Stripe metered billing, admin console complete | — |

---

## 0C. HUMAN-ONLY TASKS & INPUTS

The agent cannot do these. It builds against interfaces/mocks and lists them as `BLOCKED-HUMAN`.

| # | Needed for | Human task |
|---|---|---|
| H1 | Everything | Final brand name, domain, logo, colour tweaks, legal entity name |
| H2 | R1 | Cloud accounts (Vercel, Railway/Fly, managed Postgres, OpenSearch, Redis), DNS |
| H3 | R1 | Anthropic API key; Resend; Cal.com; PostHog; Sentry; Turnstile keys |
| H4 | R1 | Copy for every key in `/content/copy/en.json` (Section 17) |
| H5 | R1/R2 | **Data provider contracts** with **redistribution rights** for API/bulk (or decision to stay on public data only) |
| H6 | R1 | Privacy policy, terms, DPA, Legitimate Interest Assessment reviewed by a lawyer (people data = GDPR Art. 14) |
| H7 | R2 | Comparison/alternatives page facts verified and approved |
| H8 | R2 | Interest-signal source approval (legal + privacy) |
| H9 | R3 | OAuth apps + marketplace reviews: Salesforce, HubSpot, Attio, Affinity, Pipedrive, Airtable, Slack, Zapier |
| H10 | R3 | **Google OAuth verification + CASA security assessment** for Gmail/Calendar restricted scopes (weeks, paid); Microsoft publisher verification |
| H11 | R3 | Chrome Web Store developer account + review; legal check of LinkedIn page enrichment (LinkedIn's terms restrict extensions that scrape or alter its pages) |
| H12 | R3 | Snowflake / AWS / GCP accounts for bulk delivery tests |
| H13 | R1 | Stripe account, prices for seats and credit packs |
| H14 | Launch | Pen test vendor, SOC 2 auditor (optional at launch) |

---

## 0D. GLOBAL CONFIG & PLACEHOLDERS

All brand/environment values live in `packages/config/brand.ts` and `.env` — never inline.

```ts
export const brand = {
  name: process.env.BRAND_NAME ?? "{{BRAND}}",
  legalEntity: process.env.BRAND_LEGAL_ENTITY ?? "{{Legal entity}}",
  domain: process.env.BRAND_DOMAIN ?? "example.com", // www., app., api., mcp., insights.
  social: { linkedin: "", x: "" },
  salesReps: [] as { name: string; avatarUrl: string }[], // real people with consent
};
```

Numeric limits are constants in `packages/core/limits.ts` (single source for UI, docs, API, MCP): `API_RATE_LIMIT_RPS=15`, `API_MAX_PAGE_SIZE=5000`, `API_BULK_MAX=50`, `API_TRIAL_CREDITS=200`, `MCP_FREE_CALLS_PER_DAY=100`.

---

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

---

## 2. PHASE 0 RECON WITH REA — EXACT WORKFLOW

Goal: capture the public site's structure, routes, motion, network calls and front-end architecture so the front-end team can reproduce layout and interactions precisely.

> **v2 note:** REA is mainly a reverse-engineering MCP for binaries and apps. Its web tools need a Chromium you control. Tool names below come from REA's docs at the time of writing — **run `rea --help` and read the generated tool catalog (`docs/reference/mcp-contracts.md`) first, and adapt the names if they changed.** If a REA web tool is unavailable, fall back to Playwright (screenshots, HAR, computed styles) for that step. Throttle captures to ≤ 1 page every 10 s and respect robots.txt.

### 2.1 Install

```bash
# from a trusted directory OUTSIDE our repo
npx rea-agents setup          # registers REA's MCP server + investigation skill with your agent
# or CLI:
npm install --global rea-agents && rea --help
```

Static JavaScript/website analysis needs **no** Hopper/Ghidra/IDA. Linux needs a Chromium build supporting `import.meta.resolve` for module tracing (`REA_BROWSER_EXECUTABLE=/path/to/chrome`).

### 2.2 Pages to capture (public only)

```
/  /platform  /companies  /people  /investors  /transactions
/signals/talent  /signals/interest  /news  /revenue-valuation
/agents  /api  /mcp  /integrations  /pricing  /contact  /partners  /careers  /blog
/comparisons/specter-vs-{pitchbook,harmonic,grata,sourcescrub,cb-insights,crunchbase,dealroom}
/comparisons/{pitchbook,harmonic,grata}-alternatives
/privacy-policy  /privacy-rights  /terms-conditions
```

### 2.3 Per-page REA procedure

1. **Passive inspection with script sources** — MCP `inspect_web_page` with `include_script_sources: true` (CLI `--include-script-sources`). Save the Evidence JSON to `~/recon-raw/<page>/capture.json` (outside the repo — Rule 9).
2. **Scenario capture for interactions** — MCP `capture_browser_scenario` with `capture.network.response_body: true`. Script these scenarios per page: scroll top→bottom slowly; hover every header menu; open every mega-menu; click every tab (e.g. homepage "Data / Signals / Sourcing / Monitor"; profile tabs Overview…Competitors; "Revenue / Valuation" toggle; "Show 4 more datasets"); open every FAQ accordion; focus the demo form fields and open the "Firm type" and "AUM" selects (do **not** submit).
3. **Export scripts** — `export_web_scripts` (CLI `rea export-web-scripts ~/recon-raw/<page>/capture.json ~/recon-raw/<page>/scripts --json`).
4. **Static analysis** — `analyze_javascript_application` on the exported `files/` dir, and `analyze_web_bundle` with view `{kind:"web-bundle", collection:"endpoints"}` to list every network endpoint the page calls (analytics, form submission, booking widget, counters).
5. **Route inventory** — view `{kind:"javascript-routes", collection:"routes"}` to confirm the full route list (compare with sitemap).
6. **API surface of the marketing site** — `inspect_analysis_view` with `api-surface` / `environment-manifest` on the HAR/scenario Evidence → tells us how the demo form posts, how "N demos this hour" is fetched, what analytics fire.
7. **Runtime attribution for animations** — attach to Chrome via CDP (`list_browser_targets`, then `observe_web_execution` with `observation_ms: 15000`) while scrolling, to find which modules drive marquee, ticker, typing and count-up animations (expect Framer Motion / `motion` + IntersectionObserver).
8. **Module & source mapping** — `trace_web_module_imports` and, where public source maps exist, `trace_web_source_location` to identify libraries (Next.js App Router, Tailwind, Radix/shadcn, motion, charting lib).

### 2.4 Additional captures (non-REA, also required)

- Full-page screenshots at **1440, 1024, 768, 390 px** widths for every page → `~/recon-raw/<page>/screens/` (internal reference only; never committed or published).
- Computed styles of: H1/H2/H3/body, buttons (primary/secondary), cards, tables, chips, inputs, section spacing → `recon/tokens.json`.
- A screen recording of each animated section (used as the motion reference).
- Lighthouse report of each page (our target: equal or better).

### 2.5 Recon deliverables (Phase 0 exit criteria)

- [ ] `recon/README.md` — per page: section list, components used, animations, network calls, libraries identified
- [ ] `recon/routes.md` — final route list
- [ ] `recon/tokens.json` — colours, fonts, sizes, radii, shadows, spacing
- [ ] `recon/motion.md` — each animation: trigger, duration, easing, loop behaviour
- [ ] `recon/forms.md` — demo form + partner form fields, validation, submit target
- [ ] Screens at 4 breakpoints for every page (outside repo)
- [ ] `recon/sections.md` — for each page, the ordered list of section IDs we will build (e.g. `home.hero`, `home.logos`, …) — this becomes the copy-key namespace and the structural parity checklist

Already-confirmed findings from our research (verify with REA):
- Framework: **Next.js** (`next-size-adjust` meta present), **Tailwind** design system
- Fonts: **Geist** (body) and **Inter Tight** (headings); fallback stack Inter → system-ui
- Colour: primary `#4A62FF`, accent/link `#4459E8`, background `#F9FAFA`, body text `#3F3F46`, ink `#19191A`
- Buttons: primary = black `#000` pill (radius 9999px) with white text; secondary = white `#FEFEFE` pill, `#D1D4DA` border, black text
- Base spacing unit 4px, card radius 8px; H1 ≈ 72px, H2 ≈ 24px (section eyebrow-style H2s are larger — confirm), body 14px
- Light colour scheme, "modern, low-energy" tone, audience = investors and finance professionals

---

## 3. TECH STACK & MONOREPO LAYOUT

### 3.1 Stack

The stack is defined **only** in Section 0A (locked decisions). v1's comparison table was removed so there is a single source of truth.

### 3.2 Repo structure

```
/apps
  /www            # marketing site (Next.js)
  /app            # product web app (Next.js)
  /api            # public REST API (Hono on Node) — mounted at app.{{domain}}/api/v1
  /docs           # API docs site (Fumadocs) → api.{{domain}}
  /mcp            # MCP server → mcp.{{domain}}/mcp
  /extension      # Chrome extension (WXT)
  /workers        # BullMQ workers: ingestion, signals, CRM sync, digests, exports
  /ml             # Python FastAPI: revenue/valuation, scoring, entity resolution, embeddings
/packages
  /ui             # design system (shadcn-based) shared by www/app/extension
  /mocks          # marketing "product mocks" = the REAL app components from /ui rendered with fixtures + animation wrappers (no duplicate UI)
  /db             # Drizzle ORM schema + migrations
  /search         # OpenSearch mappings, query builder (filter AST → DSL)
  /core           # domain logic: entities, filters AST, credits, permissions
  /sdk            # typed TS client for our API (also used by MCP + extension)
  /agent          # agent runtime, tools, skills, prompts
  /integrations   # CRM adapters, network sources, delivery sinks
  /config         # eslint, tsconfig, tailwind preset
/recon            # REA outputs (Phase 0)
/content          # MDX: blog, comparisons, case studies, legal
```

---

## 4. DESIGN SYSTEM

### 4.1 Tokens (`packages/ui/tokens.css`)

```css
:root{
  --color-primary:#4A62FF;      /* brand blue (CTA accents, highlights, links on dark) */
  --color-accent:#4459E8;       /* links, active tab underline */
  --color-bg:#F9FAFA;           /* page background */
  --color-surface:#FFFFFF;      /* cards, tables, mock windows */
  --color-ink:#19191A;          /* headings, inputs */
  --color-text:#3F3F46;         /* body */
  --color-muted:#71717A;        /* secondary text, timestamps */
  --color-border:#E4E4E7;       /* hairlines */
  --color-border-strong:#D1D4DA;/* secondary button border */
  --color-positive:#16A34A;     /* +80% growth */
  --color-negative:#DC2626;
  --color-black:#000000;        /* primary button */
  --radius-card:8px; --radius-pill:9999px; --radius-chip:6px;
  --space:4px;                  /* base unit; use multiples */
  --font-body:"Geist",Inter,ui-sans-serif,system-ui,sans-serif;
  --font-heading:"Inter Tight","Geist",Inter,ui-sans-serif,system-ui,sans-serif;
  --font-mono:"Geist Mono",ui-monospace,monospace;
  --shadow-window:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06);
}
```

Type scale: H1 72/1.05 (‑0.03em, Inter Tight, 600) → 44px on mobile · Section H2 40–48px · Card H3 18–20px · Body 14–16px · Table 13px · Eyebrow label 12px uppercase tracking 0.08em, muted. Confirm all values from `recon/tokens.json`.

### 4.2 Core components (`packages/ui`)

Button (primary black pill / secondary white pill / ghost / link-with-arrow "→") · Badge "New" · Chip / Tag (filter chips, highlight chips "+4") · Eyebrow · SectionHeader (eyebrow + H2 + lede + optional link) · FeatureCard (H3 + body + optional link) · StatCounter (count-up on view) · LogoMarquee (infinite, pause on hover, duplicated track, edge fade masks) · TestimonialCard (bold lead phrase + quote, avatar, firm logo, role, "Case Study →") · TestimonialMarquee (two rows, opposite directions) · AppWindow (mock window frame with sidebar) · DataTable (sticky header, favicon + name cell, % deltas coloured, "—" for nulls) · SignalCard (logo, category label, title, sentence, relative time "now / 22 min / 1 hr") · CodeBlock (tabs cURL/Python/JavaScript, copy button, JSON syntax highlight) · EndpointPill (method colour + path) · ChatComposer (input with `@ # /` affordances) · Accordion (FAQ) · Tabs (underline + pill variants) · ComparisonTable (✓/✗/text cells, grouped rows, expandable "Show N more") · Select · Form fields · Toast · Tooltip · Command palette (⌘K) · Avatar + AvatarStack · Sparkline · ConfidenceBandChart · DemoPill (floating).

### 4.3 Motion rules (`recon/motion.md` is authoritative)

- Section reveal: fade-up 12px, 400ms, ease-out, once, stagger children 60ms.
- Logo marquee: 40–60s linear infinite; testimonial marquee ~80s; respect `prefers-reduced-motion` (stop and show static grid).
- Signal tickers: new card slides in from top every 2.5–3.5s; list capped at 3–6 items; timestamps update.
- Agent demo: user prompt types at ~35 chars/s → tool-step lines appear with spinner → check → result card fades in → loop after 6s idle.
- API log terminal: lines append every 150–400ms, auto-scroll, loops.
- Count-ups: 1.2s ease-out when 40% visible.
- Tab sections (homepage "Data/Signals/Sourcing/Monitor"): sticky sub-nav that highlights the section in view (scroll-spy) and scroll-to on click.
- All mocks are **real React components with JSON fixtures** (not screenshots) so text stays crisp and translatable. **Build each grid/profile/chat component once in `packages/ui` and use it in both the app and the marketing mocks.** v1 implied building them twice.
- Mocks are decorative: wrap in `aria-hidden` where they duplicate nearby text, give each a short `aria-label` summary, pause all motion when off-screen (IntersectionObserver) to save CPU.

### 4.4 Accessibility & performance budgets

WCAG 2.2 AA; keyboard-navigable menus; app grids fully keyboard-operable (arrow keys, space to select, enter to open); visible focus rings; `aria-live="polite"` for tickers (throttled); Marketing: LCP < 2.0s, CLS < 0.05, INP < 200ms on mobile (lazy-mount mocks below the fold; JS for a marketing page ≤ 180 KB gzipped). App: grid scroll 60 fps with 5,000 rows; filter result P95 < 500 ms; profile load P95 < 800 ms; fonts `display: swap` + preloaded; images AVIF/WebP via `next/image`.

---

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

---
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

---
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

---

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

---

## 9. DATA ACQUISITION & SIGNAL PIPELINES

> Data is the hardest part. Start with licensed providers and public sources; build proprietary signals on top. Every record stores `sources[]` with URL/provider + timestamp. Legal review before each new source.

### 9.0 Synthetic seed dataset (new in v2 — required for R1)
`pnpm db:seed` generates a deterministic fake universe (fixed random seed): 50k companies, 250k people, 3k investors, 40k rounds, 2k acquisitions, 300 IPOs, 30k talent signals, 20k news items, 12 months of metrics, revenue disclosures for 5% of companies. Names generated (no real people). Distributions plausible (power-law funding, headcount growth). This powers dev, tests, Storybook, demos, and the marketing mocks' fixtures. Real data replaces it via provider adapters (`packages/integrations/data/*`, one interface per dataset) without code changes elsewhere.

### 9.1 Sources (legitimate options)
| Dataset | Bootstrap sources |
|---|---|
| Companies | Licensed firmographics (e.g. People Data Labs company, Coresignal, Crunchbase API / Dealroom licence), OpenCorporates & national registries (Companies House UK, SEC EDGAR, EU registries), company websites (respect robots.txt), Common Crawl, Product Hunt, YC directory, GitHub orgs, app stores, G2/Trustpilot APIs where licensed |
| People | Licensed person data (PDL, Coresignal) incl. change feeds; GitHub API; X API; company team pages; **user-imported** LinkedIn connections export (CSV) — never scrape LinkedIn |
| Investors | Fund websites, SEC Form D / Form ADV, licensed data, rounds data (derived portfolio) |
| Transactions | SEC Form D, press-release wires (licensed feeds), news (GDELT + licensed news APIs), registries, stock exchanges for IPOs |
| Web traffic | Licensed panel data (e.g. Similarweb API) or Tranco/CrUX ranks as fallback |
| News | GDELT, licensed news APIs, RSS of 60k sources (respect terms), press wires, company blogs |
| Emails | Pattern generation + SMTP-safe verification provider (ZeroBounce/NeverBounce), licensed enrichment |

> **Redistribution check (v2):** for each source record `redistributable` per field (Rule 10). Public-domain sources (SEC, most registries) are redistributable; scraped website text generally is not redistributable verbatim (store derived facts, not copied text); licensed providers depend on contract (H5).

### 9.2 Pipeline architecture
`ingest (raw, S3 bronze)` → `normalize (silver)` → **entity resolution** (domain canonicalisation, LinkedIn/URL keys, fuzzy name + location, embeddings; probabilistic matching (Python `splink` in `apps/ml`); manual merge tool) → `canonical entities (gold, Postgres)` → `derived metrics (partitioned Postgres)` → `highlights / rank / signals` → `index (OpenSearch)` → `deliveries (alerts, webhooks, CRM push, bulk files)`.
Orchestration: BullMQ queues (one per stage) with idempotent jobs keyed by `source_record_id`, exponential retries, dead-letter queue, and a `pipeline_runs` table logging counts/errors per run. Website fetching: polite crawler (robots.txt, 1 req/s per host, identifying User-Agent, cache by ETag).

**Rank v1 (deterministic, explainable):** `rank_score = 0.30·z(headcount_growth_3m) + 0.25·z(web_visits_growth_3m) + 0.15·z(log total_funding) + 0.15·investor_quality + 0.10·signal_count_90d + 0.05·z(social_growth_3m)`, z-scores within growth stage; `rank` = position by score (1 = best). Weights in config; ML ranking later.

### 9.3 Talent signals
Detect from person change feeds + X/GitHub bio changes + registry officer appointments + new domain registrations linked to a person:
- NEW_COMPANY (founder/co-founder title at company < 12 months old, or "stealth" in company/title) · NEW_ROLE · PROMOTION (title seniority up, same company) · SEARCHING (left role, no current role, "exploring/next chapter") · OUT_OF_STEALTH (stealth company gets domain/name) · DEPARTURE from tracked "breakout" companies.
- **Score 1–10**: LightGBM/logistic model on founder quality (prior exits/IPOs, big-tech tenure, seniority, education, network size), company context, recency; calibrate against later fundraising outcomes.
- **Summary**: LLM 2-sentence summary ("X is co-founding a stealth company in … previously …") from structured facts only (no hallucination: pass facts, require citations).
- Status: STEALTH / HR (searching) / LIVE.

### 9.4 Interest signals (hardest; design carefully & legally)
Goal: "investor X is engaging with company/person Y", scored 1–10, weeks before a round.
Ethical evidence sources: (1) investor partners publicly following/engaging founders or company accounts on X/GitHub (API), (2) investors' public content mentioning companies (blogs, podcasts, newsletters), (3) co-attendance at public events/demo days, (4) SEC Form D filings & registry changes (late but anchoring), (5) **aggregated, anonymised, opt-in product telemetry** — e.g. many users from investor-type orgs viewing/adding a company in our app (disclosed in ToS, k-anonymity ≥ 5, never reveal a specific customer's activity), (6) web-visit spikes from known VC networks via licensed B2B intent data.
**v2 warning:** source (5) can leak which companies a customer is evaluating — the most confidential thing an investor has. Default: OFF. If enabled after H8: aggregate only across ≥ 5 distinct orgs, add a random 3–10 day delay, never attribute to a named firm (show "investor-type interest", not "{Fund} is interested"), contractual opt-in, org-level opt-out. Named-firm signals ("General Catalyst is interested in X") may only come from public sources (1)–(4).
Model: per (investor, target) pair, weighted events with time decay → strength 1–10; "Round forming" when ≥ N distinct firms > threshold within 30 days; forecast probability of raise within 90 days (classifier trained on historical rounds). **Requires legal/privacy sign-off before launch.**

### 9.5 News signals
Fetch → dedupe (SimHash) → NER + entity linking to companies → classify into 5 update types (revenue, profitability, traction, funding, deals/M&A) + other → extract figures → 1-line AI summary → score 0–5 (source authority × novelty × materiality); `is_major` if ≥ 4. One signal per company mention.

### 9.6 Revenue & valuation estimates (ML service)

**v0 heuristic (R1, needed because there are no training labels on day one):** `revenue_p50 = headcount × revenue_per_employee(vertical, stage, region)` from a hand-curated lookup table (`/apps/ml/priors/rpe.csv`, cited sources); P10/P90 = ×0.5 / ×1.8; confidence LOW unless a disclosure exists, in which case P50 = disclosure and confidence MEDIUM. Label clearly in UI as "Modeled (v0)". Valuation v0 = last post-money × stage-based drift, else revenue × sector multiple.
**v1 ML (R2):** once ≥ 2,000 companies have verified disclosures.

- **Anchors**: revenue disclosures extracted from news/filings/founder posts (LLM extraction → human verification queue → `revenue_disclosures`).
- **Model**: LightGBM **quantile regression** (α = 0.1, 0.5, 0.9) on features: headcount & dept mix, headcount growth, web traffic & growth, app metrics, funding total/last round/stage, investor quality, industry/business model, HQ country, age, pricing-page signals; monthly re-rating.
- **Anchor honouring**: at disclosure months, set P50 = disclosed value and collapse band; between anchors, interpolate in log-space blended with model output; band width grows with distance from last anchor and with feature sparsity.
- **Confidence tier**: HIGH (≥ 3 recent anchors or tight band), MEDIUM, LOW.
- **Valuation**: second model stacked on revenue estimate + funding history + investor quality + stage + HQ + age; re-anchor to priced rounds (band → point at round); **SHAP** values stored as `drivers` for the driver-breakdown UI.
- Growth fields: 3m/6m/1y/2y %.
- Backtest: MAPE and P10–P90 coverage (target ≈ 80–90%) on held-out disclosed companies; publish methodology page.
- **Leakage guard:** when backtesting, only use features available *before* each disclosure date.
- Model versions stored (`model_version`); UI and API expose it; rollback = repoint version.

### 9.7 Competitors / similar companies
Embeddings (description + website + taxonomy) → kNN candidates → re-rank (taxonomy overlap, customer focus, business model, stage, geography) → LLM explanation → overlap 0–10. Recompute weekly and on profile change.

### 9.8 Freshness SLAs
Signals: < 24h from source. Company/people deltas: daily incrementals. Estimates: monthly + on new anchor. Index lag: < 5 min from DB write.

---

## 10. AI LAYER — AGENTS, SKILLS, PERSONALIZATION, AI SEARCH

### 10.1 Agent runtime (`packages/agent`)
- Model: Claude via AI SDK with tool calling, streaming, extended thinking for planning; max steps 25; per-thread token budget; cost tracked as credits.
- **Cost guardrails (v2):** per-message cap (e.g. 200k input tokens), per-user daily cap, prompt caching for system prompt + skill text, tool results truncated to the fields the step needs (projection), large result sets stored as artifacts and referenced by ID instead of re-sent.
- **Evaluation harness:** `/apps/agent-evals` with 50 fixed prompts on the seed dataset, expected tool calls, and graders (no unsourced numbers, correct entities, no cross-org leakage). Runs in CI on agent changes.
- **Plan → act → answer** loop with visible **step list** in UI ("Searching companies for 'AI infrastructure'", "Reading investor interest", "Ranking by raise likelihood", "Creating list …" ✓).
- **Tools** = the same functions as MCP tools (Section 12) + `web_search` + `web_fetch` + `create_table` + `chart` + `draft_email` + `export_csv`. Write tools require user confirmation chip in chat (Allow once / Always for this thread / Deny).
- **Answers**: markdown with inline **source chips** (entity links + web URLs); result tables can be **saved to a list** or exported; long outputs saved as **artifacts** (memo, market map table, chart).
- **Composer**: `@` mention entities (company/person/investor typeahead), `#` reference a list or saved search, `/` run a skill; attachments (CSV of companies to enrich); model/effort selector optional.
- **Context**: org CRM data (owner, stage, pipeline) + user's network + current page (if launched from a profile) + **Agent instructions** (personalization: role, thesis, stages, geographies, delivery style, "flag anything in CRM").
- Threads: Private/Shared; history grouped by date; rename; delete; share link to teammates.
- Scheduled agents: run a skill on cadence (e.g. `/weekly-brief` every Monday 07:00) → digest email/Slack.

### 10.2 Skills
`skills` = named playbooks `{slug, name, description, steps[], inputs[], output_format}`. Editor: name (`/slug`), ordered steps (natural language), optional filters/datasets, output template; Draft → Save; Share with team; curated library (read-only, can duplicate).
Curated skills to ship: `/market-map`, `/diligence-brief`, `/weekly-brief`, `/founder-check`, `/company-brief`, `/thesis-screen`, `/competitor-map`, `/fund-intel`, `/warm-intro-paths`, `/portfolio-pulse`, `/stealth-radar`, `/lp-update-pull`.
Skill execution = system prompt with steps + enforced tool sequence where specified.

### 10.3 AI search (NL → filters)
Shared function `nlToQuery(text, product?)` → `{product, filter_ast, sort, explanation}`; JSON-schema-constrained output; validator rejects unknown fields; ambiguous terms resolved via taxonomy embedding lookup; returns `query_id` for paging (API `POST /search`).

### 10.4 Entity extraction
`POST /entities/extract`: unstructured text → resolved company/person/investor matches with confidence (NER + resolver). Used in CRM notes, news, and API "turn text into entities".

### 10.5 Guardrails
Only state numbers that came from tool results; every factual claim needs a source chip; refuse to reveal other customers' activity; PII rules for emails/phones (credit-gated, logged); prompt-injection defence for web content (tool results treated as data; web text wrapped and labelled untrusted; write tools never triggered by instructions found in tool results); `web_fetch` goes through an SSRF-safe egress proxy (blocks private IP ranges, metadata endpoints, non-HTTP schemes).

### 10.6 Use-case coverage the agent must handle (acceptance prompts)
Sourcing (thesis sweeps by momentum, stealth founders, look-alikes) · Diligence (company brief with sources, founder background, revenue/valuation in context) · Market maps (segment categories, competitive landscape, map own CRM book) · Monitoring (read saved searches on cadence, portfolio moves, alumni spinouts) · Outreach (warm intro paths, founder brief, outreach drafts) · CRM enrichment (enrich records, rank pipeline, resurface stale deals on new signals) · Competitive intel (head-to-head, category momentum, rival news) · Talent (exec hires/departures, founder quality, hiring surges) · Reporting (deal memos, Monday market update, deck-ready tables).

---

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

---

## 12. MCP SERVER — 29 TOOLS

Hosted at `https://mcp.{{domain}}/mcp` (Streamable HTTP; SSE fallback). Auth: OAuth 2.1 with dynamic client registration (works as custom connector in Claude Desktop/claude.ai and ChatGPT; `claude mcp add --transport http …` one-liner for Claude Code; config snippets for Cursor, Windsurf, OpenCode). Tools call the internal SDK; responses formatted as compact, memo-ready markdown + structured JSON. Write tools carry `annotations.destructiveHint/readOnlyHint` so clients prompt for confirmation.

| Category | Tool | R/W | Cost |
|---|---|---|---|
| Resolve & search (4) | `find_company` (domain/name/LinkedIn) · `find_person` (LinkedIn URL/email/name) · `find_investor` · `search` (plain English, any product, compact ranked list) | R | resolve free; search paid |
| Company intelligence (10) | `get_company_profile` (memo format) · `get_company_competitors` (limit) · `get_company_funding` · `get_company_revenue` · `get_company_valuation` · `get_company_news` · `get_company_investor_interest` · `get_company_people` · `get_company_traction` · `get_company_transactions` (M&A/IPO) | R | paid |
| People (3) | `get_person_profile` · `get_person_email` · `get_person_talent_signals` (since) | R | paid |
| Investors (3) | `get_investor_profile` · `get_investor_rounds` (with co-investors) · `get_investor_interest_signals` | R | paid |
| Lists (5) | `get_lists` (free) · `get_list_items` · `create_list` (W) · `add_to_list` (W) · `remove_from_list` (W) | 2R/3W | management free |
| Saved searches (4) | `get_saved_searches` (free) · `get_saved_search_items` (`since_last_read`) · `create_saved_search` (W) · `update_saved_search` (W) | 2R/2W | management free |

Totals: 24 read + 5 write = 29. **Metering (clarified in v2):** every tool call — free or paid — counts as 1 toward the user's 100 free calls/day (resets 00:00 UTC). After the allowance: free tools (resolve, list/search management) keep working at 0 credits; paid tools draw org API credits at the Section 11 price table **only if** an admin enabled overage, otherwise they return a clear limit message with the reset time. Tool outputs are capped (~4k tokens) with a `next_cursor` for more, so agents don't blow their context. Server prompts (MCP `prompts`): "Qualify competitors of {company}", "Weekly saved-search digest", "Warm paths to a list".

---

## 13. INTEGRATIONS

### 13.1 CRM sync (Attio, Affinity, Salesforce, HubSpot, Pipedrive, Airtable)
Adapter interface `{connect, listObjects, pull(cursor), push(records), fieldMap, webhooks?}` in `packages/integrations/crm/*` (or use Nango for OAuth + sync infra).
- **Pull setup**: choose objects (companies/people/deals), filters, field mapping → **match preview** ("5,535 matched & visible / unmatched") → confirm → store `crm_records` + matching to our entities.
- **Push setup**: target object, field mapping, dedupe key (domain/LinkedIn), create-or-update, owner assignment; push from grid, list, profile, extension, agent, MCP.
- **Scheduled enrichments**: write our fields back to CRM on cadence; saved searches can auto-push new matches.
- CRM dimensions become filters (CRM owner, lifecycle/deal stage, last activity, open deals); every record shows **In CRM / Not synced / In but not enriched** badge.
- **Activity log** of every push/pull with counts and errors.

### 13.2 Network tracking
Sources per user: LinkedIn connections via **official data export CSV upload** (contains name, company, position, connected-on, sometimes email — match quality is limited; show match rate) (and/or partner API where permitted), Gmail & Google Calendar (OAuth, metadata only: from/to/date — **restricted scopes require Google verification + annual CASA assessment, see H10**), Outlook & Microsoft Calendar (Graph). Build `network_edges` with strength (recency × frequency × channel). Team-wide merged & **deduped** view; "warmest path" ranking; alerts when a contact changes job / founds a company / gets investor interest ("{Company} hired from your network"). Privacy: per-user opt-in, never expose email content, admin can't see personal inbox data beyond edges.

### 13.3 Chrome extension (WXT, MV3)
- Toolbar/side panel: detects current site domain → company card (logo, rank, one-liner, HQ, founded, model chips, raised, key people, team size with Δ) → actions **Push to CRM / Add to list / Like / View in app**.
- ⚠️ **R3 + legal gate (H11):** LinkedIn's User Agreement prohibits extensions that scrape or modify its site. Build this content script behind a remote feature flag, default OFF. If legal says no, the side panel (which only reads the active tab's URL) is the whole extension.
- LinkedIn content script: on company & profile pages inject a "View on {{BRAND}}" button + inline metrics panel (team growth, funding history) — **read DOM only for the URL/ID of the page being viewed**, never bulk-scrape; comply with Chrome Web Store policy.
- Auth via app session (OAuth PKCE); uses public API with user's org credits.

### 13.4 Alerts & automation
Slack app (channel alerts, `/{{brand}} lookup` slash command), email (Resend), **Zapier** app (triggers: new search result, new signal; actions: enrich company/person, add to list), **webhooks** (Section 11), CSV export.

### 13.5 Bulk delivery
Per project: datasets (companies, people, investors, transactions, estimates), field selection, format CSV/Parquet, sink (S3 bucket w/ IAM role, GCS bucket, **Snowflake** via Secure Data Sharing or stage + COPY), cadence: full snapshot then **daily incrementals** (`{dataset}_YYYY-MM-DD.parquet`) with `op` column (upsert/delete) and stable IDs; manifest + checksums; estimates include P10/P50/P90, confidence and anchors.

---
## 14. BILLING, CREDITS, SEATS, ADMIN, SECURITY & COMPLIANCE

### 14.1 Commercial model (mirrors target; prices are "contact sales")
- **Platform seat** (annual, per user) — required for API access.
- **API** — credit packs metered per billing period (Stripe metered billing on `credit_ledger`).
- **Bulk data** — custom contract per project.
- **MCP** — 100 free calls/day/user, overage from API credits if admin enables.
- Trials: 200 API credits after key approval. Demo-led sales for platform.

### 14.2 Credit engine (`packages/core/credits`)
Single `charge(orgId, actor, surface, operation, units, matched)` used by app exports, email reveals, API, MCP and agent. Atomic decrement in Postgres (`UPDATE … SET balance = balance - $n WHERE balance >= $n RETURNING`) → ledger row → `usage_events` row. Misses free. Pre-flight check returns 402 with clear message when empty. Monthly reset/rollover rules configurable.

### 14.3 Roles & permissions
Org roles Admin / Member / Viewer; object visibility Private / Team; API key scopes (read:data, write:lists, write:searches, read:network, admin); row-level security on every org-scoped table (Postgres RLS by `org_id`).

### 14.4 Security
SOC 2-ready controls from day 1: SSO/SAML + SCIM (enterprise), MFA, encrypted secrets (KMS) for CRM/OAuth tokens, audit log, least-privilege IAM, dependency scanning, secret scanning, WAF + bot protection on public endpoints, Turnstile + per-IP rate limits on marketing forms, CSP headers, signed webhooks, penetration test before launch.
- **SSRF:** one egress proxy for every server-side fetch of a user-supplied URL (webhooks, agent `web_fetch`, CSV-imported domains, crawler).
- **CSV injection:** exported cells starting with `= + - @ \t \r` are prefixed with `'`.
- **Upload safety:** CSV imports ≤ 20 MB, parsed in a worker, row limit 100k.
- **Secrets:** per-environment, never in client bundles; `NEXT_PUBLIC_` audit in CI.
- **Cross-tenant tests** (Section 8 tenancy note) block merges.

### 14.5 Privacy & compliance (people data!)
- Lawful basis assessment (legitimate interest) + **LIA** documented; GDPR Art. 14 notices; CCPA/CPRA "do not sell/share" handling.
- Public **Privacy Rights** page + DSAR form → `dsar_requests` → workflow to export/delete/suppress a person (suppression list blocks re-ingestion).
- Data retention policies; source provenance per field; no special-category data; email reveal gated & logged.
- Interest-signal telemetry: disclosed in ToS, aggregated, k-anonymity, opt-out at org level.
- DPA for customers; subprocessors list page.
- **Cookie consent** banner on all marketing pages (EU/UK opt-in; US opt-out link "Your privacy choices"); analytics and booking-widget cookies load only after consent.

---

## 15. BUILD PHASES, MILESTONES & ACCEPTANCE CRITERIA

v2 changes: phases are sequential (a single coding agent cannot run tracks in parallel); each phase is tagged with its release; data acceptance uses the seed dataset (real-data volume depends on H5); pixel-diff against the reference is replaced by **structural parity** (every section ID in `recon/sections.md` exists, in order, with its required components) because our copy and brand intentionally differ.

**Phase gate procedure (every phase):** 1) write `/docs/progress/phase-N.md` plan (tasks, files, risks); 2) implement in small PRs; 3) run `pnpm verify` (lint, typecheck, unit, e2e for touched areas, build); 4) run the phase's acceptance checks and paste evidence (command output, screenshots paths, numbers); 5) list anything `BLOCKED-HUMAN`; 6) stop and ask for human review at the end of each **release**.

Order: 0 → 1 → 3a → 2 → 3b → 5a → (R1 review) → 4 → 5b → 6 → 7 → 9 → (R2 review) → 8 → 10 → (R3 review).

### Phase 0 — Recon & foundations (Section 2 + 3)
- REA recon deliverables complete; monorepo scaffolded; CI (lint, typecheck, test, preview deploys); design tokens + base components in Storybook.
- ✅ Storybook shows every component in 4.2 with light theme; `recon/*` committed.

### Phase 1 — Design system & marketing shell [R1]
- Global chrome (announcement bar, header + 3 mega-menus, mobile menu, footer incl. "Ask AI" links, floating demo pill, cookie consent), Home, Platform, Companies, People, Investors, Transactions, Pricing, Contact (+ Cal.com + CRM lead), Partners, legal pages (incl. Privacy Rights/DSAR form and opt-out), 404/500. Links to R2/R3 pages render a tasteful "coming soon" state or are hidden by a feature flag — never a 404.
- `packages/mocks`: AppWindow + all DB table mocks, SignalCard ticker, Agent typing demo, API log terminal, CodeBlock with tabs, LogoMarquee, TestimonialMarquee.
- ✅ Structural parity: every R1 page's section IDs from `recon/sections.md` present in order (automated test reads `data-section` attributes); Lighthouse mobile ≥ 90 performance, ≥ 95 accessibility/best-practices/SEO; forms validated, Turnstile on, leads reach CRM (or a mock sink if H3 pending); cookie consent works; reduced-motion respected; `[TODO-COPY]` count reported.

### Phase 3a — App shell on seed data [R1]
- Auth/orgs/invites/onboarding, shell, ⌘K, EntityGrid + filter builder on Postgres-only queries against the seed (OpenSearch comes in Phase 2), profiles, lists, saved searches.
- ✅ The Phase 3b E2E scenarios pass on seed data (Postgres-only queries).

### Phase 2 — Data platform v1 [R1]
- Postgres schema + migrations; taxonomy seed; seed dataset + public pipeline (SEC Form D, registries, company websites); licensed-provider adapter stubbed until H5; entity resolution v1; OpenSearch indices + outbox sync; partitioned metrics tables; `platform_stats`; rank v1; highlights v1; **revenue/valuation v0 heuristic** (9.6); competitors v0 (taxonomy + business-model overlap, scored 0–10).
- ✅ Seed dataset + at least one real public pipeline (SEC Form D → companies/rounds/investors) running end-to-end with provenance; OpenSearch sync lag < 5 min; filter P95 < 500 ms at seed scale **and** in a 10M-company synthetic load test; duplicate rate < 2% on a 500-record audit sample. Real-data volume targets set once H5 is resolved.

### Phase 3b — Product app core on OpenSearch [R1]
- Switch grids/filters to OpenSearch; EntityGrid for **Companies, People, Investors, Funding Rounds**; filter builder (AST, nested groups, all operators); NL→filters; company profile tabs **Overview, Business, Financials, Team, News, Competitors**; person & investor profiles; Lists; Saved Searches with new-since-last-read + **email digest**; statuses, likes, notes; CSV import/export; Stripe seat subscription + credit-pack purchase (basic). (Remaining grids and tabs → Phase 4.)
- ✅ E2E (Playwright) scenarios: build nested filter, save search, receive new result, add to list, export; profile tabs render real data; shareable URLs restore state.

### Phase 4 — Signals & intelligence [R2]
- Talent signals pipeline + scoring + summaries; news pipeline (classify, score, summarise); competitor model v1 (embeddings) replacing R1 taxonomy-overlap competitors; highlights v2; revenue & valuation **ML** model (+ anchors queue, bands, confidence, drivers) replacing v0; new grids: Talent Signals, Acquisitions, IPOs; profile tabs Traction Metrics & Reviews; real-time & in-app & Slack alerts. (Interest signals are R3, Phase 8, behind H8.)
- ✅ Talent signals precision ≥ 85% on a 200-item human-labelled sample; news classification F1 ≥ 0.8; revenue model P10–P90 coverage 80–90% on backtest; digests delivered on schedule.

### Phase 5a — API core [R1]: read endpoints for companies/people/investors/rounds, resolve, lists, saved searches, account, keys, credits, docs, TS SDK.
### Phase 5b — API complete [R2]: signals, AI search, extraction, network, webhooks, Python SDK.
### Phase 5 (shared acceptance)
- Every route in the Section 11 table (5a = R1 subset, 5b = rest), OpenAPI, docs site with console, llms.txt files, key request/approval, rate limiting, credits ledger, redistribution filter, webhooks (5b).
- ✅ Contract tests for every endpoint against OpenAPI; 15 rps limit enforced; misses not charged; `X-Credits-*` headers correct; docs build with samples in 3 languages.

### Phase 6 — Agents & Skills [R2]
- Agent runtime, tools, step UI, sources, confirmations, personalization, skills editor/library/sharing, scheduled skills, artifacts, save-to-list.
- ✅ All 9 use-case prompts in 10.6 produce sourced answers with zero unsourced numbers (eval set of 50 prompts, LLM-graded + human spot-check).

### Phase 7 — MCP server [R2]
- 29 tools, OAuth, metering (100/day), write confirmations, prompts, install guide & help articles.
- ✅ Works in Claude Desktop, Claude Code, ChatGPT connector, Cursor, Windsurf, OpenCode (manual test matrix); MCP Inspector passes.

### Phase 8 — Integrations [R3]
- CRM adapters ×6 (pull/push/match preview/schedule/log), network sources (LinkedIn CSV, Gmail, Outlook, calendars), Chrome extension, Zapier app, bulk delivery to S3/GCS/Snowflake, **Interest Signals grid + pipeline behind flag (H8)**, Integrations marketing page, ClickHouse migration if volumes require.
- ✅ Round-trip sync test per CRM sandbox; extension approved on Chrome Web Store (unlisted first); bulk incremental replay test.

### Phase 9 — Remaining marketing pages & content [R2]
- Talent, Interest (page ships only if H8 approved; else hidden), News, Revenue & Valuation, Agents, API, MCP pages (all sections in Section 6); comparison & alternatives templates (10 pages, legally reviewed); blog/insights/case studies/careers; SEO (sitemap.xml, robots, JSON-LD, OG images); analytics events.
- ✅ Every section in Section 6 present (structural parity test); all mocks wired to fixtures; link checker passes; **copy similarity check**: script compares every shipped string against the reference text captured in recon (n-gram overlap); any string with ≥ 8 consecutive matching words fails the build.

### Phase 10 — Billing, admin, compliance, hardening, launch [R3; billing basics in R1]
- Stripe seats + credits, admin console, DSAR workflow, audit log, pen test, load test (API 15 rps × 200 keys), backups/DR, status page, on-call runbooks.
- ✅ Launch checklist signed off by Eng, Legal, Security, Marketing.

---

## 16. TESTING & QA STRATEGY

- **Unit** (Vitest): filter AST → DSL compiler (every operator), credit engine, entity resolver, scoring functions, NL→filter validator.
- **Contract**: OpenAPI-driven tests (Schemathesis) for API; MCP tool schemas.
- **E2E** (Playwright): marketing navigation, forms; app flows in Phase 3; agent smoke tests with recorded tool fixtures.
- **Visual regression**: Playwright screenshots of every marketing section at 4 breakpoints vs **our own** approved baselines. Parity with the reference is checked structurally (section IDs), not by pixels.
- **Tenancy tests**: cross-org access attempts on every repo function, API route and MCP tool.
- **Agent evals**: Section 10 harness in CI.
- **Data quality**: SQL data-quality checks in `packages/db/quality`, run nightly and in CI on the seed (nulls, ranges, duplicate rates, freshness), labelled samples for signals precision.
- **ML**: backtests for revenue/valuation, calibration plots, drift monitors.
- **Load**: k6 for API & search.
- **Security**: SAST, DAST (ZAP), dependency audit, pen test.
- **Accessibility**: axe in CI; manual keyboard & screen-reader pass.
- **REA on our own build**: rerun the Phase 0 REA captures on our staging site and diff route inventory, network endpoints and module graph against `recon/` to catch missing pages/interactions.

---

## 17. COPY & MARKETING DELIVERABLES

Copy team produces `content/copy/<page>.md` for every page in Section 6, section by section, matching the **intent** and **length** of the reference (H1 ≤ 8 words, sub ≤ 25 words, card bodies 1–2 sentences), in our brand voice: confident, precise, low-hype, investor-literate. Rules:
- Rewrite everything in our own words — no sentences lifted from the reference.
- Every number is a live variable (`{stats.companies}`) or a verified claim with a source.
- Social proof only from real customers with written permission.
- SEO: target keywords per page (e.g. "private company database", "startup revenue estimates", "stealth startup tracker", "investor database", "VC deal sourcing platform", "private markets API", "MCP private market data"); unique titles/descriptions; internal links mirroring the reference's cross-links.
- Launch kit: OG images per page, product video (60–90s), LinkedIn/X launch posts, Product Hunt page, email to waitlist, sales one-pager, demo script for reps, help-center articles (MCP install guide, MCP pricing, API quickstart, CRM setup per provider, extension install).
- Weekly newsletter template (Insights).

---

## 18. FINAL "NOTHING MISSED" MASTER CHECKLIST

**Global**
- [ ] Announcement bar (CMS-driven, dismissible)
- [ ] Header: Platform mega-menu (overview + Data 4 + Features 6 + promo banner), Agents, API, Integrations mega-menu (Connect 4 + Delivery 3 with "New" badge), Resources (Blog, Insights), Pricing, Log in, Get started
- [ ] Mobile nav sheet
- [ ] Footer: 7 link columns, socials, 5 "Ask AI" deep links, © line, 3 legal links
- [ ] Floating demo pill with real count
- [ ] Logo marquee · testimonial marquee · press row · final CTA band · Agents/MCP/API promo blocks
- [ ] SEO: titles, descriptions, OG/Twitter images, JSON-LD, sitemap.xml, robots.txt, canonical

**Marketing pages (each with all sections from Section 6)**
- [ ] Home (16 sections) · [ ] Platform (9) · [ ] Companies (11) · [ ] People (14) · [ ] Investors (9) · [ ] Transactions (17) · [ ] Talent Signals (7) · [ ] Interest Signals (7) · [ ] News (10) · [ ] Revenue & Valuation (9, incl. `#valuation-estimates`) · [ ] Agents (8) · [ ] API (9) · [ ] MCP (7) · [ ] Integrations (8, anchors #crm #network #chrome #api) · [ ] Pricing (3 plans + 7 FAQs) · [ ] Contact/demo form (7 fields + booking) · [ ] Partners (+ application form) · [ ] Careers · [ ] Blog · [ ] Insights + newsletter · [ ] Case study template · [ ] 7 "vs" comparison pages · [ ] 3 "alternatives" pages · [ ] Privacy Policy · [ ] Privacy Rights (DSAR) · [ ] Terms · [ ] Opt-out · [ ] 404/500

**Product app**
- [ ] Shell w/ Browse/Agent modes, notifications, workspace switcher
- [ ] ⌘K quick search
- [ ] Grids: Companies, People, Investors, Talent Signals, Interest Signals, Funding Rounds, Acquisitions, IPOs (+ News in context)
- [ ] Export, saved views, Clear/Save Search, Sort by Rank, Status, Add Filter, filter chips
- [ ] Nested AND/OR filter builder + taxonomy + highlights + CRM/network/list filters + NL→filters
- [ ] Saved searches w/ new-since-last-read, cadence alerts, channels
- [ ] Lists (company/people/investor), custom fields, statuses, notes, CSV import w/ match preview, system lists My CRM / My Network / Liked
- [ ] Company profile: 8 tabs (Overview, Business, Financials, Team, Traction Metrics, Reviews, News, Competitors) + actions
- [ ] Person profile (Get Email, signals, experience, education, investments, network)
- [ ] Investor profile (stats, portfolio, co-investors, interest, fit score)
- [ ] Signal detail drawers, Round-forming view, forecast card
- [ ] Digests (daily/weekly/real-time) via in-app, email, Slack, webhook
- [ ] Settings (workspace, members, integrations, API keys, MCP overage, credits, personalization, statuses, privacy, audit)
- [ ] Internal admin console

**Data & intelligence**
- [ ] Companies 250+ fields · People 60+ · Investors · Rounds/M&A/IPOs
- [ ] Entity resolution + merge tool
- [ ] Taxonomy & classifier with QA queue
- [ ] Highlights & rank
- [ ] Talent signals (6 types, status, score, summary)
- [ ] Interest signals (sources, score 1–10, round forming, forecast) — legal sign-off
- [ ] News signals (5 update types, 0–5 score, majors, summaries)
- [ ] Revenue & valuation (quantile model, anchors, bands, confidence, drivers, growth %s)
- [ ] Competitors (overlap 0–10)
- [ ] Time-series traction metrics
- [ ] Verified emails

**AI**
- [ ] Agent runtime w/ steps, sources, confirmations, artifacts, save-to-list
- [ ] Composer `@ # /`
- [ ] Personalization (instructions)
- [ ] Skills: create, share, curated library (12), scheduled runs
- [ ] Web search enrichment
- [ ] AI search endpoint & entity extraction

**Developer**
- [ ] 73 API endpoints, keys w/ approval, 200 trial credits, 15 rps, 5,000/page, 50/bulk, misses free, credit headers
- [ ] Docs site, console, OpenAPI 3.0, cURL/Python/JS samples, llms.txt, llms-full.txt, Markdown per page
- [ ] Webhooks (signed)
- [ ] MCP: 29 tools (24R/5W), OAuth, 100 free/day, overage toggle, prompts, install guides for 6 clients

**Integrations**
- [ ] CRM ×6: pull, push, match preview, field mapping, scheduled enrichment, CRM filters, activity log
- [ ] Network: LinkedIn CSV, Gmail, Outlook, calendars; team dedupe; warm paths; move alerts
- [ ] Chrome extension: any-site side panel + LinkedIn inline panel; push/list/like
- [ ] Slack app, Email, Zapier, CSV
- [ ] Bulk: S3, GCS, Snowflake; CSV/Parquet; full + daily incrementals; stable IDs; estimates

**v2 additions**
- [ ] Section 0A decisions applied; no "or" left in code choices
- [ ] `pnpm dev:up` one-command local env; `.env.example` complete
- [ ] Synthetic seed dataset + provider adapter interfaces
- [ ] Copy keys everywhere; `[TODO-COPY]` build gate; copy-similarity gate
- [ ] Onboarding, empty/loading/error states, responsive policy
- [ ] Memberships (multi-org), entity_type on polymorphic tables, taxonomy & schools tables, notifications, FX
- [ ] Field provenance + redistribution filter on API/MCP/export/bulk
- [ ] Credit price table in config; cursor pagination; API versioning policy
- [ ] SSRF egress proxy, CSV-injection guard, webhook URL validation
- [ ] Cookie consent + Turnstile
- [ ] Revenue v0 heuristic before ML; leakage-safe backtest
- [ ] Interest-signal telemetry OFF by default; no named-firm attribution from telemetry
- [ ] LinkedIn content script behind flag (legal gate)
- [ ] Agent cost guardrails + eval harness
- [ ] `BLOCKED-HUMAN` list maintained

**Business & compliance**
- [ ] Stripe seats + metered credits; contact-sales flows
- [ ] RBAC + RLS; SSO/SCIM; audit log
- [ ] DSAR + suppression list; DPA; subprocessors; LIA
- [ ] Monitoring, backups, status page, runbooks

---

## 19. AGENTS.md + KICK-OFF PROMPT FOR THE CODING AGENT

### 19.1 `/AGENTS.md` (create this file in the repo root in your first action; OpenCode and most coding agents read it automatically on every session)

```markdown
# AGENTS.md — {{BRAND}}

### What this repo is
A private-markets intelligence platform (marketing site, app, API, docs, MCP, workers, ML, extension).
The plan lives in /docs/plan/*.md (split from MASTER_PLAN_v2.md). Progress lives in /docs/progress/.

### Before every task
1. Read /docs/progress/current.md (what phase, what's next, what's blocked).
2. Read only the plan sections that task needs (listed in current.md).
3. Check /docs/decisions.md for anything already decided.

### Non-negotiable rules
- Plan precedence: 00-ground-rules > 0A decisions > 0B scope > 15 phases > rest.
- Never copy the reference site's text, brand assets, code, customer logos or testimonials.
  All UI text uses copy keys; missing text shows [TODO-COPY key].
- Recon raw files live outside the repo (~/recon-raw). Never commit them.
- No scraping of LinkedIn or any site whose terms forbid it. Respect robots.txt.
- Every org-scoped query goes through packages/core/repo with an OrgContext.
- Every server-side fetch of a user-supplied URL goes through the egress proxy.
- Every public number comes from platform_stats or packages/core/limits.ts.
- TypeScript strict; no any; no ts-ignore. Tests with every change.
- Don't start the next release without human approval.
- If blocked by a human-only item (plan 0C), stub behind an interface, add it to
  /docs/progress/blocked.md as BLOCKED-HUMAN, and move on.

### Commands
pnpm dev:up | pnpm db:migrate | pnpm db:seed | pnpm dev | pnpm verify | pnpm test:e2e | pnpm storybook

### Definition of done (per task)
Code + tests + types pass (`pnpm verify`), docs/progress updated, no new TODO-COPY in
production-only paths, screenshots for UI changes saved under /docs/progress/screens/.
```

### 19.2 Kick-off prompt (paste into the coding agent)

```text
You are the lead engineer on {{BRAND}}, a private-markets intelligence platform.
MASTER_PLAN_v2.md (attached / in repo root) is the single source of truth.

Do this, in order, and stop at each STOP:

1. Split MASTER_PLAN_v2.md into /docs/plan/NN-<slug>.md, one file per top-level section,
   text unchanged. Create /AGENTS.md exactly as in Section 19.1. Create /docs/decisions.md,
   /docs/progress/current.md, /docs/progress/blocked.md (pre-filled with every item in
   Section 0C). Commit.

2. Phase 0 (Section 2 + 0A): scaffold the monorepo per Section 3.2 and 0A, docker compose
   local stack, .env.example, CI (pnpm verify), Storybook. Install REA outside the repo,
   verify its tool names with `rea --help`, and run the recon workflow on the PUBLIC
   marketing pages only, saving raw output to ~/recon-raw and our notes to /recon.
   Produce recon/sections.md (ordered section IDs per page).
   STOP: report repo tree, recon summary, section ID list, and anything that differed
   from the plan.

3. Continue with the phase order in Section 15 for Release 1 only
   (Phase 1 → 3a → 2 → 3b → 5a). Follow the phase gate procedure for each phase.
   STOP at the end of Release 1: report acceptance evidence for every R1 phase, the
   [TODO-COPY] key list for the copy team, and the BLOCKED-HUMAN list.

Rules: follow /AGENTS.md at all times. When the plan is ambiguous, choose the simplest
option consistent with it, write the decision in /docs/decisions.md, and keep going.
Never invent data sources, legal approvals, credentials or customer proof.
```

---

## 20. v1 → v2 AUDIT CHANGELOG

What the audit found in v1 and how v2 fixes it (severity: 🔴 would break or derail the build · 🟠 serious risk · 🟡 quality gap).

| # | Sev | v1 flaw | v2 fix |
|---|---|---|---|
| 1 | 🔴 | No scope cut: "build all 9 surfaces" with no MVP, unrealistic for one coding agent | Section 0B: three releases with explicit in/out lists and human gates |
| 2 | 🔴 | Stack had a dozen "X or Y" choices the agent would have to decide mid-build | Section 0A locks every choice; v1 table marked superseded |
| 3 | 🔴 | Phase 2 acceptance required 1M+ companies — impossible without paid data contracts the agent can't sign | Synthetic seed dataset (9.0) + provider adapter interfaces; real-volume targets deferred to H5 |
| 4 | 🔴 | No list of human-only work (contracts, OAuth app reviews, legal, keys) — agent would stall or fake it | Section 0C + `BLOCKED-HUMAN` workflow |
| 5 | 🔴 | Section 6 still contained near-verbatim headlines from the reference; an agent would ship them | Rule 8 + copy keys + `[TODO-COPY]` build gate + copy-similarity check |
| 6 | 🔴 | Licensed data was planned to be resold via API/bulk without redistribution rights | Rule 10 + per-field provenance + automatic filtering |
| 7 | 🔴 | Data model: single-org users despite a workspace switcher; polymorphic tables without `entity_type`; missing schools, taxonomy, notifications, FX tables | Section 8 rewritten parts: memberships, entity_type, new tables |
| 8 | 🔴 | Tenancy relied on Postgres RLS, which Drizzle's privileged connection bypasses | Mandatory `OrgContext` repo layer + RLS as backup + cross-tenant tests |
| 9 | 🟠 | Recon plan would have committed the reference's scripts/assets into our repo | Rule 9: raw recon stays outside git |
| 10 | 🟠 | REA tool names presented as certain; no fallback | Verify with `rea --help`, Playwright fallback, throttling |
| 11 | 🟠 | Pixel-diff "≤2% deviation vs reference" contradicts using our own brand/copy | Structural parity via section IDs |
| 12 | 🟠 | Marketing mocks and app UI would be built twice | Mocks reuse real `packages/ui` components with fixtures |
| 13 | 🟠 | Revenue ML model had no labels on day one (cold start) | v0 heuristic in R1; ML in R2 at ≥ 2,000 disclosures; leakage-safe backtests |
| 14 | 🟠 | Interest-signal telemetry could expose which deals customers are evaluating | OFF by default; aggregate, delayed, never named-firm from telemetry; legal gate H8 |
| 15 | 🟠 | LinkedIn on-page enrichment conflicts with LinkedIn's terms | Feature flag OFF + legal gate H11 |
| 16 | 🟠 | Gmail/Calendar restricted scopes need Google verification + CASA (weeks, paid) — not mentioned | Flagged in 13.2 and H10 |
| 17 | 🟠 | Missing SSRF protection (webhooks, agent web_fetch, imports), CSV injection, upload limits | Section 14 additions + egress proxy |
| 18 | 🟠 | No cookie consent / bot protection on a marketing site that targets the EU | Consent banner + Turnstile |
| 19 | 🟠 | Credit costs undefined ("per page" of up to 5,000 rows?) | Price table in config |
| 20 | 🟠 | Pagination "page or cursor" undecided; no API versioning policy | Cursor pagination; versioning + Sunset headers |
| 21 | 🟠 | MCP free-call rules contradicted each other (free tools vs 100/day) | Clarified metering rules |
| 22 | 🟡 | Endpoint count fudged to hit "73" | Clean 74-row table; marketing count generated from OpenAPI |
| 23 | 🟡 | No onboarding, empty/loading/error states, responsive policy, credits UX | Section 7.1b |
| 24 | 🟡 | No local dev setup, env template, conventions, definition of done | 0A local dev + conventions; AGENTS.md DoD |
| 25 | 🟡 | "Parallel" phases impossible for a single agent; no release gates | Sequential order + gate procedure |
| 26 | 🟡 | No agent cost limits or eval harness | Section 10 guardrails + CI evals |
| 27 | 🟡 | ClickHouse/Temporal/Sanity etc. added ops burden in R1 | Deferred or dropped |
| 28 | 🟡 | Rank undefined | Deterministic rank v1 formula |
| 29 | 🟡 | Multi-currency rounds ignored | FX table, USD cents + original currency |
| 30 | 🟡 | 1,100-line plan loaded whole into a limited-context agent | Split into /docs/plan + AGENTS.md + current.md |
| 31 | 🟡 | Performance targets only for marketing pages | App targets added (grid fps, filter/profile P95) |
| 32 | 🟡 | Kick-off prompt had no stop points | Explicit STOPs after Phase 0 and Release 1 |

**Known remaining risks (not fixable in a document):** data coverage and quality depend on contracts (H5); interest and revenue signals' accuracy can only be proven with real data over months; legal review (H6, H8, H11) can remove or reshape features; LLM and data-licensing costs need a budget owner.

---

*End of master plan v2.*
