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
