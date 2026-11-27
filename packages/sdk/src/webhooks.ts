/**
 * Webhook signature verification (plan 11): `X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>`.
 * Web Crypto only, so it runs in Node 18+, Deno, Bun, Cloudflare Workers and Vercel Edge.
 * Pass the raw request body (before JSON parsing).
 */

export type WebhookEvent<T = Record<string, unknown>> = { id: string; type: string; created_at: string; data: T };

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the signature is ours and no older than `toleranceSec` (default 5 minutes). */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string | Uint8Array,
  header: string | null | undefined,
  opts: { toleranceSec?: number; now?: number } = {},
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const now = opts.now ?? Date.now() / 1000;
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now - t) > (opts.toleranceSec ?? 300)) return false;
  const body = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
  return timingSafeEqual(await hmacHex(secret, `${t}.${body}`), parts.v1);
}

/** Verify, then parse. Throws when the signature is invalid or stale. */
export async function constructWebhookEvent<T = Record<string, unknown>>(secret: string, rawBody: string | Uint8Array, header: string | null | undefined, opts?: { toleranceSec?: number; now?: number }): Promise<WebhookEvent<T>> {
  if (!(await verifyWebhookSignature(secret, rawBody, header, opts))) throw new Error("Invalid or stale webhook signature");
  return JSON.parse(typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody)) as WebhookEvent<T>;
}
