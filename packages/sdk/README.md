# @founders/sdk (TypeScript)

Typed client for the Founders AI API. Paths, path parameters, query parameters and request bodies are
typed from the API's OpenAPI document (`src/schema.ts`, generated; a test fails if it drifts).
No runtime dependencies: it uses `fetch` and Web Crypto, so it runs on Node 18+, Deno, Bun and edge runtimes.

```ts
import { FoundersAI, NotFoundError } from "@founders/sdk";

const fa = new FoundersAI(); // FOUNDERS_AI_API_KEY, optional FOUNDERS_AI_BASE_URL

const company = await fa.companies.get("com_…");
console.log(company.$meta.creditsCharged, company.$meta.creditsRemaining);

// Cursor pagination
for await (const signal of fa.paginate((p) => fa.signals.talent({ ...p, min_score: 8, signal_date_after: "2026-11-01" }))) {
  console.log(signal);
}

// Plain-English search, then page through it (query_id is valid for 7 days)
const q = await fa.search.ai({ query: "Series A fintech in Brazil with growing headcount", limit: 25 });
const more = await fa.search.results(q.query_id, { cursor: q.next_cursor ?? undefined });

// Any endpoint, fully typed from the OpenAPI document
await fa.get("/investors/{investorId}/portfolio", { path: { investorId: "inv_…" }, query: { limit: 50 } });
```

- `$meta` on every result: `creditsCharged`, `creditsRemaining`, `requestId`, `replayed` (not enumerable, so `JSON.stringify` is clean).
- 429 is retried after `Retry-After`; 5xx and network errors with exponential backoff (`maxRetries`, default 3). 501 is never retried.
- Every POST carries an `Idempotency-Key` (pass `idempotencyKey` to control it), so a retry is never charged twice.
- Typed errors: `AuthenticationError` 401, `InsufficientCreditsError` 402, `PermissionDeniedError` 403,
  `NotFoundError` 404 (never charged), `RateLimitError` 429, `NotAvailableYetError` 501, `ServerError` 5xx.

## Webhooks

```ts
import { constructWebhookEvent } from "@founders/sdk/webhooks";

export async function POST(req: Request) {
  const raw = await req.text(); // raw body, before JSON parsing
  const event = await constructWebhookEvent(process.env.WEBHOOK_SECRET!, raw, req.headers.get("X-Signature"));
  // event: { id, type, created_at, data }
  return new Response(null, { status: 204 });
}
```

## Development

```bash
pnpm --filter @founders/sdk generate   # after changing an API route
pnpm --filter @founders/sdk test       # unit + webhook + drift; end-to-end against the seeded DB when it is up
```
