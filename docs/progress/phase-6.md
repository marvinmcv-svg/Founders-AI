# Phase 6 — Agents & Skills (R2)

Started 2026-11-26 ("go ahead with Phase 6"). Plan sections: 10.1, 10.2, 10.5, 10.6, 15 (Phase 6), 7 (agent sidebar, profile "Ask agent").

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 6.0 | Migration 0005: `agent_threads`, `agent_messages`, `agent_artifacts`, `skills`, `agent_preferences`, `skill_schedules` (RLS on) | `packages/db/drizzle/0005_phase6_agent.sql`, `core/src/repo/agent.ts` | done |
| 6.1 | Agent runtime: plan → act → answer, step list persisted live, 25-step cap, token budget, credits, daily cap (D-036, D-039) | `packages/agent/src/{runtime,recorder}.ts` | done |
| 6.2 | Claude engine: manual Messages API loop, adaptive thinking, refusal fallbacks, cached system prompt, `web_search`, pause/resume on write tools (D-036) | `packages/agent/src/engine/claude.ts` | done (tested with a scripted client; live run needs H3) |
| 6.3 | Rules engine fallback for every use case in 10.6 (D-037) | `packages/agent/src/engine/rules.ts` | done |
| 6.4 | Tools (MCP-shaped reads + web_fetch via egress proxy + create_table, chart, save_memo, draft_email, export_csv + confirm-gated create_list, add_to_list, save_search) | `packages/agent/src/tools.ts` | done |
| 6.5 | Guardrails: number guard (D-038), untrusted web text wrapped, writes always re-confirmed after web reads, no cross-org reads | `packages/agent/src/guard.ts`, `recorder.ts` | done |
| 6.6 | Skills: 12 curated, editor (draft/save), share with team, duplicate, `/slug` in composer, scheduled skills (in-app + Slack) | `packages/agent/src/{skills,schedules}.ts`, `apps/app/.../agent/skills` | done |
| 6.7 | Personalization (user + workspace defaults, seeded from onboarding thesis) | `apps/app/.../agent/personalization` | done |
| 6.8 | App: Browse \| Agent switch, agent sidebar (New chat · Personalization · Skills · history by date), composer with `@` `#` `/`, steps, source chips, confirmation chips, tables with Save to list, artifacts (memo/chart/email/CSV), Private/Shared threads, rename/delete, "Ask agent" on profiles | `apps/app/src/components/agent/*`, `apps/app/src/app/(app)/agent/*` | done |
| 6.9 | Eval harness: 50 prompts on the seed, graders, CI test (D-041) | `apps/agent-evals` | done |

## Acceptance evidence (2026-11-26, local Postgres 16, seed scale 1)

| Plan 15 Phase 6 criterion | Result |
|---|---|
| All 9 use cases in 10.6 produce sourced answers | 50/50 prompts pass on the rules engine across sourcing (7), diligence (8), market maps (5), monitoring (5), outreach (4), CRM enrichment (5), competitive intel (5), talent (5), reporting (4), safety (2). `pnpm --filter @founders/agent-evals eval`. |
| Zero unsourced numbers | 0 answers with unsourced numbers; every figure line carries a source chip (`cited` grader). |
| Eval set of 50 prompts, LLM-graded + human spot-check | Deterministic graders run in CI. **LLM grading** is wired (`llmScore`) and runs when Claude is reachable — **blocked by H3** (key returns 401). **Human spot-check** — **BLOCKED-HUMAN (H15)**. |
| Confirmations | Write tools pause with Allow once / Always for this thread / Deny; tested in unit, eval (`confirmation`) and e2e. |
| No cross-org leakage | Thread/skill/artifact/personalization tenancy tests; eval `no_leak` grader incl. an adversarial prompt naming another org's list. |
| UI | `e2e/tests/app.agent.spec.ts` (5 tests) pass; screenshots `docs/progress/screens/phase-6-*.png`. |

Median eval turn on the rules engine: ~110 ms.

## Still open
- Live Claude runs and LLM-graded eval scores need a working `ANTHROPIC_API_KEY` (H3). Until then every answer comes from the rules engine (labelled in the UI).
- Composer attachments (CSV of companies to enrich) and the model/effort selector (optional in plan) are not built.
- Scheduled skills deliver in-app and to Slack; email delivery waits on Resend (H3).
- Thread "share link" = Shared-with-team visibility; there is no public link (by design, data stays in the workspace).
