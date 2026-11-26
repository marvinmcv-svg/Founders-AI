# Billing (Stripe)

Modes (D-065): **live** (`STRIPE_SECRET_KEY`), **contact sales** (no key; H13), **simulator** (`BILLING_SIMULATOR=1`, never in production).

## Going live (H13)
1. Stripe account; products & prices: annual per-seat price → `STRIPE_PRICE_SEAT_ANNUAL`; one-off prices for the credit packs → `STRIPE_PRICE_CREDITS_10K/50K/250K`; a **billing meter** with event name `founders_credit_overage` (sum of `value`, customer mapping `stripe_customer_id`) and a metered price on it for overage.
2. Webhook endpoint `https://<app>/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`; secret → `STRIPE_WEBHOOK_SECRET`.
3. Customer portal enabled (invoices, payment methods, cancel at period end).
4. Set the env vars on `founders-ai-app`, unset `BILLING_SIMULATOR`, redeploy. Smoke test with a test-mode key first.

## Webhook failing
- Symptom: status page "Billing degraded" (`stripe_events` with `error` and no `processed_at`), Stripe dashboard shows failed deliveries.
- 400 = bad signature (wrong `STRIPE_WEBHOOK_SECRET`, or a proxy altered the body) — fix the secret; Stripe stops retrying 400s, so **resend** the events from the dashboard afterwards.
- 500 = our handler threw; the error is in `stripe_events.error`. Fix, deploy, then resend. Events are applied once by id, so resending is safe.

## Credits
- Customer says credits are missing after buying a pack: find the checkout in Stripe, check `stripe_events` for its `checkout.session.completed` (applied? error?). Resend the event, or `/admin?tab=accounts` → Adjust (note the Stripe payment id).
- Period reset happens on `invoice.paid` (renewal); rules per account in Admin → Contract terms.

## Overage metering
- Daily job `billing-usage` sends overage to the meter; failures are `usage_reports.status = FAILED` and are retried with the **same identifier** (no double billing). Contact-sales accounts are `SKIPPED` — invoice them by hand from Admin → Accounts (ledger rows with `overage > 0`).
