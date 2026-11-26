/**
 * API toolkit: endpoint registry (Hono route + OpenAPI from Zod), auth, rate limit, credits,
 * cursor pagination and RFC 7807 errors (plan Section 11).
 */
import type { Context, Hono, MiddlewareHandler } from "hono";
import { z } from "zod";
import { API_MAX_PAGE_SIZE, API_DEFAULT_PAGE_SIZE, API_RATE_LIMIT_RPS } from "@founders/core/limits";
import { bodyHash, charge, getBalance, getIdempotent, InsufficientCreditsError, storeIdempotent, verifyApiKey, type ApiPrincipal, type OrgContext } from "@founders/core/repo";

export type Env = { Variables: { principal: ApiPrincipal; requestId: string; started: number } };
export type Ctx = Context<Env>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    detail?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
  }
}

export function problem(c: Context, status: number, title: string, detail?: string, extra?: Record<string, unknown>) {
  return c.newResponse(JSON.stringify({ type: `https://httpstatuses.io/${status}`, title, status, detail, ...extra }), status as 400, {
    "Content-Type": "application/problem+json",
  });
}

export const orgCtx = (c: Ctx): OrgContext => {
  const p = c.get("principal");
  return { orgId: p.orgId, userId: p.userId, role: p.scopes.includes("admin") ? "admin" : "member" };
};

/* ---------------- auth + rate limit ---------------- */

const buckets = new Map<string, { tokens: number; at: number }>();
/** Token bucket per key: API_RATE_LIMIT_RPS sustained, same burst. Redis-backed in production (H2). */
function take(key: string): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: API_RATE_LIMIT_RPS, at: now };
  b.tokens = Math.min(API_RATE_LIMIT_RPS, b.tokens + ((now - b.at) / 1000) * API_RATE_LIMIT_RPS);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, remaining: 0, retryAfter: Math.ceil((1 - b.tokens) / API_RATE_LIMIT_RPS) || 1 };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, remaining: Math.floor(b.tokens), retryAfter: 0 };
}

export const authMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header("x-api-key") ?? c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) return problem(c, 401, "Unauthorized", "Send your API key in the X-API-Key header.");
  const principal = await verifyApiKey(header.trim());
  if (!principal) return problem(c, 401, "Unauthorized", "Invalid, pending or revoked API key.");
  const rl = take(principal.keyId);
  c.header("X-RateLimit-Limit", String(API_RATE_LIMIT_RPS));
  c.header("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.ok) {
    c.header("Retry-After", String(rl.retryAfter));
    return problem(c, 429, "Too Many Requests", `Limit is ${API_RATE_LIMIT_RPS} requests per second per key.`);
  }
  c.set("principal", principal);
  await next();
};

/**
 * Idempotency-Key on POST (plan 11): the first response (status < 500) is stored for 24 h and
 * replayed verbatim, uncharged, for the same key + method + path + body. Reusing a key with a
 * different request is a 422.
 */
export const idempotencyMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const key = c.req.header("idempotency-key");
  if (c.req.method !== "POST" || !key) return next();
  if (key.length > 255) return problem(c, 400, "Bad Request", "Idempotency-Key must be at most 255 characters.");
  const ctx = orgCtx(c as Ctx);
  const raw = await c.req.text();
  const hash = bodyHash(raw);
  const prior = await getIdempotent(ctx, key);
  if (prior) {
    if (prior.method !== c.req.method || prior.path !== c.req.path || prior.body_hash !== hash) {
      return problem(c, 422, "Unprocessable Entity", "This Idempotency-Key was already used for a different request.");
    }
    return c.newResponse(prior.response, prior.status as 200, {
      "Content-Type": prior.status >= 400 ? "application/problem+json" : "application/json",
      "Idempotent-Replayed": "true",
      "X-Credits-Charged": "0",
    });
  }
  await next();
  if (c.res.status < 500) {
    const response = await c.res.clone().text();
    await storeIdempotent(ctx, key, { method: c.req.method, path: c.req.path, body_hash: hash, status: c.res.status, response });
  }
};

export function requireScope(c: Ctx, scope: string) {
  if (!c.get("principal").scopes.includes(scope)) throw new ApiError(403, "Forbidden", `This key lacks the ${scope} scope.`);
}

/* ---------------- credits ---------------- */

export async function bill(c: Ctx, operation: string, credits: number, matched: boolean) {
  const p = c.get("principal");
  try {
    const r = await charge({
      orgId: p.orgId,
      actorType: "api_key",
      actorId: p.keyId,
      surface: "API",
      operation,
      credits,
      matched,
      requestId: c.get("requestId"),
      latencyMs: Date.now() - c.get("started"),
    });
    c.header("X-Credits-Charged", String(r.charged));
    c.header("X-Credits-Remaining", String(r.remaining));
  } catch (e) {
    if (e instanceof InsufficientCreditsError) throw new ApiError(402, "Payment Required", e.message, { needed: e.needed, balance: e.balance });
    throw e;
  }
}

export async function preflight(c: Ctx, credits: number) {
  if (credits <= 0) return;
  const bal = await getBalance(c.get("principal").orgId);
  if (bal < credits) throw new ApiError(402, "Payment Required", `This request needs up to ${credits} credits; balance is ${bal}.`, { needed: credits, balance: bal });
}

/* ---------------- pagination ---------------- */

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(API_MAX_PAGE_SIZE).default(API_DEFAULT_PAGE_SIZE).describe(`Page size (max ${API_MAX_PAGE_SIZE}).`),
  cursor: z.string().optional().describe("Opaque cursor from `next_cursor`."),
});

export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: number };
    return Math.max(0, Number(o.o) || 0);
  } catch {
    throw new ApiError(400, "Bad Request", "Invalid cursor.");
  }
}

export function nextCursor(offset: number, returned: number, total: number): string | null {
  const next = offset + returned;
  return returned > 0 && next < total ? Buffer.from(JSON.stringify({ o: next })).toString("base64url") : null;
}

/* ---------------- endpoint registry → Hono + OpenAPI ---------------- */

export type CreditRule = "free" | "per_match" | "per_page" | "per_result" | string;

export type Endpoint = {
  method: "get" | "post" | "patch" | "delete";
  path: string; // Hono style: /companies/:companyId
  tag: string;
  summary: string;
  credit: CreditRule;
  /** Set for routes that are registered but not yet released (they answer 501). */
  release?: "R3";
  query?: z.ZodObject;
  body?: z.ZodType;
  handler: (c: Ctx, input: { params: Record<string, string>; query: Record<string, unknown>; body: unknown }) => Promise<Response>;
};

export const ENDPOINTS: Endpoint[] = [];

export function endpoint(e: Endpoint) {
  ENDPOINTS.push(e);
  return e;
}

export function mount(app: Hono<Env>) {
  for (const e of ENDPOINTS) {
    app[e.method](e.path, async (c) => {
      const q = e.query ? e.query.safeParse(c.req.query()) : { success: true as const, data: {} };
      if (!q.success) return problem(c, 400, "Bad Request", q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      let body: unknown = undefined;
      if (e.body) {
        const raw = await c.req.json().catch(() => undefined);
        const b = e.body.safeParse(raw);
        if (!b.success) return problem(c, 400, "Bad Request", b.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        body = b.data;
      }
      return e.handler(c as Ctx, { params: c.req.param() as Record<string, string>, query: q.data as Record<string, unknown>, body });
    });
  }
}

const CREDIT_TEXT: Record<string, string> = {
  free: "Free",
  per_match: "1 credit per matched record (misses are free)",
  per_page: "1 credit per 100 records returned",
  per_result: "1 credit per 100 results returned",
};

export function openApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const oaPath = e.path.replace(/:(\w+)/g, "{$1}");
    const params = [...e.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const queryParams = e.query
      ? Object.entries((z.toJSONSchema(e.query, { io: "input" }) as { properties?: Record<string, { description?: string }>; required?: string[] }).properties ?? {}).map(([name, schema]) => ({
          name,
          in: "query",
          required: false,
          description: schema.description,
          schema,
        }))
      : [];
    paths[oaPath] ??= {};
    paths[oaPath][e.method] = {
      tags: [e.tag],
      summary: e.summary,
      description: `Credits: ${CREDIT_TEXT[e.credit] ?? e.credit}`,
      "x-credits": e.credit,
      ...(e.release ? { "x-release": e.release } : {}),
      parameters: [...params, ...queryParams],
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(e.body, { io: "input" }) } } } } : {}),
      responses: {
        "200": { description: "OK" },
        "400": { description: "Invalid request (problem+json)" },
        "401": { description: "Missing or invalid API key" },
        "402": { description: "Not enough credits" },
        "404": { description: "Not found (not charged)" },
        "429": { description: "Rate limited" },
        ...(e.release ? { "501": { description: `Not available until ${e.release} (not charged)` } } : {}),
      },
      security: [{ ApiKey: [] }],
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "Founders AI API", version: "1.0.0", description: "Private-markets data: companies, people, investors, transactions, signals, lists and saved searches." },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } } },
    paths,
  };
}
