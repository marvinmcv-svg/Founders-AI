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
