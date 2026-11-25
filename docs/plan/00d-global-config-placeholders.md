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
