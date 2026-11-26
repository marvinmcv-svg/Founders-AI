# Phase 7 — MCP server (R2)

Started 2026-11-26 ("go ahead with Phase 7"). Plan sections: 12, 15 (Phase 7), 14 (metering), 0A.

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 7.0 | Migration 0006: `jwks`, `oauth_client`, `oauth_resource`, `oauth_client_resource`, `oauth_access_token`, `oauth_refresh_token`, `oauth_consent`, `oauth_client_assertion` (shapes from the plugins' `getSchema()`), RLS on | `packages/db/drizzle/0006_phase7_mcp_oauth.sql` | done (local + cloud) |
| 7.1 | OAuth 2.1 authorization server (D-044): PKCE, DCR, CIMD via egress proxy, audience-bound JWTs, workspace consent → `org` claim; discovery routes; consent page; login continues the OAuth flow | `apps/app/src/lib/auth.ts`, `apps/app/src/app/{.well-known,oauth}` | done |
| 7.2 | MCP server: `@modelcontextprotocol/server` v2, Streamable HTTP (2026-07-28 + stateless 2025 fallback), mounted at `/mcp`, OAuth bearer or API key; standalone `src/node.ts` | `apps/mcp`, `apps/app/src/app/mcp/route.ts` | done |
| 7.3 | 29 tools (24 read + 5 write) with read-only/destructive annotations; compact markdown + structured JSON, ~4k-token cap, cursors; R3 interest tools answer "Release 3" | `apps/mcp/src/tools.ts` | done |
| 7.4 | Metering: 100 free calls/day/user (UTC), paid tools after that only with admin overage, clear limit message with reset time; misses free (D-046) | `packages/core/src/repo/mcp.ts` | done |
| 7.5 | Server prompts: qualify competitors, weekly saved-search digest, warm paths to a list | `apps/mcp/src/server.ts` | done |
| 7.6 | Settings → MCP (overage toggle, per-user usage, connected apps + disconnect) and install guide (Claude, Claude Code, ChatGPT, Cursor, Windsurf, OpenCode, API-key clients) on Settings and /developers | `apps/app/src/components/mcp/*` | done |

## Acceptance evidence (2026-11-26, local)

| Plan 15 Phase 7 criterion | Result |
|---|---|
| 29 tools | `apps/mcp/test/mcp.test.ts`: inventory equals plan 12 (24 read, 5 write), annotations correct over the wire. |
| OAuth | `e2e/tests/app.mcp.spec.ts`: 401 + RFC 9728 challenge → protected-resource metadata → AS metadata → DCR → authorize (PKCE + `resource`) → login → consent (workspace) → code → token (JWT + refresh) → `initialize`, `tools/list` (29), `tools/call`, `prompts/list` with the bearer; bad token 401; Deny → `access_denied`. |
| Metering (100/day) | Unit test fills the allowance: paid tools refused with reset time, free tools still work; overage on → 1 credit charged; misses free. |
| Write confirmations | Write tools carry `readOnlyHint: false` (`remove_from_list` also `destructiveHint: true`) so clients ask before calling. |
| Prompts | 3 prompts listed via `prompts/list` (e2e + MCP Inspector). |
| MCP Inspector passes | `npx @modelcontextprotocol/inspector@2.16.0 --cli <url>/mcp --transport http`: `tools/list` → 29, `prompts/list` → 3, `tools/call find_company` and `get_company_profile` return content + structuredContent. |
| Works in Claude Desktop, Claude Code, ChatGPT, Cursor, Windsurf, OpenCode | **BLOCKED-HUMAN (H16, manual test matrix)** — needs a person with those clients against the deployed URL. Protocol behaviour each relies on (OAuth discovery, DCR/CIMD, PKCE, Streamable HTTP 2025 + 2026) is covered by the tests above. |
| Install guide & help articles | Install guide in Settings → MCP and /developers#mcp. Help-center articles wait for the docs site (R1 carry-over). |

Screenshots: `docs/progress/screens/phase-7-mcp-consent.png`, `phase-7-settings-mcp.png`.

## Still open
- Manual client matrix (H16) on the production URL.
- `mcp.{domain}` hostname needs DNS (H2); until then the server lives at `<app>/mcp`.
- No container images exist yet for any service (R1 carry-over); `apps/mcp/src/node.ts` is ready for one.
