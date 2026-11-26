import { Hono } from "hono";
import { cors } from "hono/cors";
import { brand } from "@founders/config";
import { ForbiddenError, NotFoundError } from "@founders/core/repo";
import { ApiError, authMiddleware, ENDPOINTS, idempotencyMiddleware, mount, openApiDocument, problem, type Env } from "./kit";
import "./routes";

/** Public REST API, mounted at app.{domain}/api/v1 (plan 0A). */
export const app = new Hono<Env>().basePath("/api/v1");

app.use("*", cors({ origin: "*", allowHeaders: ["X-API-Key", "Authorization", "Content-Type", "Idempotency-Key"], exposeHeaders: ["X-Credits-Charged", "X-Credits-Remaining", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-Request-Id", "Idempotent-Replayed"] }));
app.use("*", async (c, next) => {
  const id = c.req.header("x-request-id") ?? `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  c.set("requestId", id);
  c.set("started", Date.now());
  c.header("X-Request-Id", id);
  await next();
});

// Public, unauthenticated: OpenAPI + agent-readable docs.
app.get("/openapi.json", (c) => c.json(openApiDocument(`${brand.urls.app}/api/v1`)));
app.get("/llms.txt", (c) =>
  c.text(
    [
      `# ${brand.name} API`,
      "",
      "> Private-markets data: companies, people, investors, transactions, talent signals, lists and saved searches.",
      "",
      `Base URL: ${brand.urls.app}/api/v1 · Auth: X-API-Key header · JSON · cursor pagination (limit, cursor → next_cursor).`,
      "Every response carries X-Credits-Charged and X-Credits-Remaining. Misses (404) are never charged.",
      "POST accepts Idempotency-Key (replayed for 24 h, never charged twice). Rate limit: 15 requests/second per key (429 + Retry-After).",
      "Webhooks: POST /webhooks returns a signing secret once. Each delivery has X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + \".\" + raw body)>; retried 6 times with backoff; endpoints failing for 24 h are disabled.",
      "Endpoints marked R3 answer 501 (not charged) until they launch.",
      "SDKs: Python (packages/sdk-python). Errors are RFC 7807 problem+json.",
      "",
      "## Endpoints",
      ...ENDPOINTS.map((e) => `- ${e.method.toUpperCase()} ${e.path.replace(/:(\w+)/g, "{$1}")} — ${e.summary} (${e.credit})${e.release ? ` [${e.release}]` : ""}`),
      "",
      `Full spec: ${brand.urls.app}/api/v1/openapi.json`,
    ].join("\n"),
  ),
);

app.use("*", authMiddleware);
app.use("*", idempotencyMiddleware);
mount(app);

app.notFound((c) => problem(c, 404, "Not Found", `No route ${c.req.method} ${c.req.path}`));
app.onError((err, c) => {
  if (err instanceof ApiError) return problem(c, err.status, err.title, err.message, err.extra);
  if (err instanceof NotFoundError) return problem(c, 404, "Not Found", `${err.message}. Not charged.`);
  if (err instanceof ForbiddenError) return problem(c, 403, "Forbidden", err.message);
  if (err instanceof Error && err.message.startsWith("Invalid filter")) return problem(c, 400, "Bad Request", err.message);
  console.error(err);
  return problem(c, 500, "Internal Server Error", "Something went wrong. Include X-Request-Id when contacting support.");
});

export { ENDPOINTS };
export default app;
