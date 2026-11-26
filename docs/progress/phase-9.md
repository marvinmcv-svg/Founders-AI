# Phase 9 — Remaining marketing pages & content (R2)

Started 2026-11-26 ("start with the next phase"), right after the brand-first home redesign (D-047). Plan sections: 06 (6.7, 6.9–6.13, 6.17), 15 (Phase 9), 17, 0B.

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 9.1 | Talent Signals `/signals/talent`, News `/news`, Revenue & Valuation `/revenue-valuation` (`#valuation-estimates`) | `apps/www/src/app/{signals/talent,news,revenue-valuation}`, `components/mocks/signals.tsx` | done |
| 9.2 | Agents `/agents`, API `/api` (endpoint explorer), MCP `/mcp` (client switcher, 29-tool catalogue, copyable URL) | `apps/www/src/app/{agents,api,mcp}`, `components/mocks/ai*.tsx` | done |
| 9.3 | Shared page kit in the home page's visual language | `apps/www/src/components/sections/kit.tsx` | done |
| 9.4 | Blog (Markdown + frontmatter, tags, authors, related, RSS, BlogPosting JSON-LD), Insights, weekly-letter signup | `content/blog/*`, `apps/www/src/lib/blog.ts`, `app/{blog,insights,authors}` | done |
| 9.5 | Careers (values; roles from Ashby when `ASHBY_JOB_BOARD` is set) | `app/careers`, `lib/careers.ts` | done; roles **BLOCKED-HUMAN H18** |
| 9.6 | Comparison / alternatives template + `/comparisons` index; reviewed JSON only, validated at build | `lib/comparisons.ts`, `app/comparisons/*`, `content/comparisons/` | template done; pages **BLOCKED-HUMAN H17** |
| 9.7 | SEO: per-page titles/descriptions/canonicals, branded OG images (`/og`), sitemap (pages, posts, tags, authors, comparisons), Organization/WebSite/SoftwareApplication JSON-LD | `lib/meta.ts`, `app/og/route.tsx`, `app/sitemap.ts`, `app/layout.tsx` | done |
| 9.8 | Analytics events, consent-gated, no PII (`cta_open_app`, `cta_book_demo`, `cta_ecosystem`, `newsletter_signup`, `api_sample_view`, `mcp_client_switch`, `mcp_copy_url`, `blog_post_click`) | `lib/analytics.ts`, `components/chrome/Analytics.tsx` | done |
| 9.9 | Link checker | `e2e/tests/www.links.spec.ts` | done |
| 9.10 | Copy similarity check (≥ 8 consecutive words vs reference text fails) | `scripts/copy-similarity.mjs`, `pnpm copy:similarity` (in `pnpm verify`) | done; skips until recon text exists (D-011) |
| 9.11 | Interest Signals page | — | not built: needs H8 (plan: page ships only if approved) |

Public numbers on these pages come from `platform_stats` (`{stats.*}`) or `packages/core/limits.ts` (`{limits.*}`). New limits: `MCP_TOOL_COUNT`, `MCP_WRITE_TOOL_COUNT`, `API_ENDPOINT_COUNT`, `AGENT_CURATED_SKILL_COUNT`, each pinned by a test against the real inventory (apps/mcp, apps/api, packages/agent).

Left out on purpose (plan rules): API usage-mix charts and "data lands / feeds pulled" charts (need our own `usage_events` telemetry first), the API comparison table and every competitor claim (need dated sources + legal review, H17), the CRM-connected agent mock (CRM sync is R3), testimonials and logo walls (no customers with written permission yet).

## Acceptance evidence (2026-11-26, local)

| Plan 15 Phase 9 criterion | Result |
|---|---|
| Every Section 6 section present (structural parity) | `recon/sections.md` lists the new pages; `e2e/tests/www.parity.spec.ts` checks each renders exactly those sections, in order, with no TODO-COPY. |
| Mocks wired to fixtures | All mocks read `@founders/mocks` fixtures (synthetic seed data) and say so in the footer note. |
| Link checker passes | `www.links.spec.ts`: every sitemap page returns 200; every internal link resolves (< 400 after redirects) and every `#anchor` exists. |
| Copy similarity check | `scripts/copy-similarity.mjs` + unit tests (8-word runs, case/punctuation-insensitive). Reference text was never captured (D-011), so the check reports "skipped" until it exists in `~/recon-raw/text`. |
| SEO | Unique title/description/canonical per page, `/og` image per page, sitemap with posts, RSS, JSON-LD. |
| Analytics events | `apps/www/test/analytics.test.ts`: nothing sent without opt-in, unknown events and email-like values dropped. |
| Comparison pages legally reviewed | **BLOCKED-HUMAN H17.** The build rejects any comparison file without `reviewed`, `reviewedBy`, `asOf` and sources; drafts (`_*.json`) never publish (unit + e2e). |

Tests: `apps/www` Vitest (content rules, analytics, similarity), `apps/mcp`/`apps/api`/`packages/agent` count pins, e2e www project (27 tests; the contact-form test needs a seeded Postgres and fails in a DB-less container).

Screenshots: `docs/progress/screens/www-{talent,news,revenue-valuation,agents,api,mcp}.png`.
