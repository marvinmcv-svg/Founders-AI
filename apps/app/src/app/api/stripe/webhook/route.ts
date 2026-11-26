import * as repo from "@founders/core/repo";

/**
 * Stripe webhook (plan 14.1). Verifies `Stripe-Signature` over the raw body, applies each event once.
 * 400 for a bad signature or body (Stripe stops retrying), 500 if applying fails (Stripe retries).
 */
export async function POST(req: Request) {
  const body = await req.text();
  let result: Awaited<ReturnType<typeof repo.processStripeWebhook>>;
  try {
    result = await repo.processStripeWebhook(body, req.headers.get("stripe-signature"));
  } catch (e) {
    if (e instanceof repo.BillingUnavailableError) return Response.json({ error: "billing not configured" }, { status: 404 });
    const msg = e instanceof Error ? e.message : String(e);
    if (/Stripe-Signature|Not a Stripe event|JSON/i.test(msg)) return Response.json({ error: msg }, { status: 400 });
    console.error("[stripe] webhook failed", msg);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
  return Response.json({ received: true, status: result.status });
}
