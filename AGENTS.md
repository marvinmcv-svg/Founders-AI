# AGENTS.md — Founders AI

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
