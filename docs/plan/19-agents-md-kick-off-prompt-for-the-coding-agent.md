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
