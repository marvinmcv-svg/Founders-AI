import type { Metadata } from "next";
import Link from "next/link";
import { CREDIT_PACKS } from "@founders/core/pricing";
import * as repo from "@founders/core/repo";
import { Badge, Card } from "@founders/ui";
import { getCtx } from "@/lib/session";
import { BillingControls } from "./BillingClient";

export const metadata: Metadata = { title: "Billing" };

const fmt = (n: number) => n.toLocaleString("en-US");
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—");
const PACK_CREDITS = new Map(CREDIT_PACKS.map((p) => [p.id as string, p.credits]));
function ledgerLabel(reason: string) {
  if (reason.startsWith("pack:")) return `Credit pack · ${fmt(PACK_CREDITS.get(reason.slice(5)) ?? 0)}`;
  return ({ period_reset: "Period reset", period_start: "Period start" } as Record<string, string>)[reason] ?? (reason.startsWith("admin") ? "Adjusted by Founders" : reason);
}
const STATUS_TONE: Record<string, "positive" | "warning" | "negative" | "neutral"> = { active: "positive", trialing: "positive", past_due: "warning", unpaid: "negative", canceled: "negative" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ checkout?: string; portal?: string }> }) {
  const ctx = await getCtx();
  const isAdmin = ctx.role === "admin" || ctx.role === "owner";
  const { checkout, portal } = await searchParams;
  const s = await repo.getBillingSummary(ctx);
  const reports = isAdmin ? await repo.listUsageReports(ctx, 8) : [];
  const a = s.account;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <Link href="/settings" className="text-[12px] text-muted hover:text-ink">← Settings</Link>
        <h1 className="mt-1 text-[22px] font-semibold">Billing</h1>
        <p className="text-[13px] text-muted">Platform seats are billed annually per user; API, exports, email reveals, MCP overage and the agent draw from one credit balance.</p>
      </div>
      {checkout === "success" ? <Card className="border-positive/40 p-3 text-[13px] text-positive">Payment received. Changes appear here as soon as Stripe confirms them.</Card> : null}
      {checkout === "cancel" ? <Card className="p-3 text-[13px] text-muted">Checkout cancelled; nothing was charged.</Card> : null}
      {portal === "simulated" ? <Card className="p-3 text-[13px] text-muted">Simulator: the Stripe customer portal (invoices, payment methods, cancellation) opens here once Stripe is connected.</Card> : null}
      {s.mode === "contact_sales" ? (
        <Card className="border-warning/40 p-4 text-[13px]">
          <p className="text-ink">Online billing is not connected yet.</p>
          <p className="mt-1 text-muted">To add seats or buy credits, contact sales: your account manager applies the change and it shows here. (Stripe account and prices: H13.)</p>
        </Card>
      ) : s.mode === "simulated" ? (
        <Card className="border-info/40 p-3 text-[12.5px] text-muted"><Badge tone="info">Simulator</Badge> Checkout runs through an in-app simulator that sends the same signed webhook events Stripe would. No card is charged.</Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-[12px] text-muted">Plan</p>
          <p className="mt-1 text-[18px] text-ink">{a.subscription_status === "none" ? "No subscription" : "Platform"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            {a.subscription_status !== "none" ? <Badge tone={STATUS_TONE[a.subscription_status] ?? "neutral"}>{a.subscription_status.replace("_", " ")}</Badge> : null}
            {a.current_period_end ? <span className="text-faint">{a.cancel_at_period_end ? "ends" : "renews"} {day(a.current_period_end)}</span> : null}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-muted">Seats</p>
          <p className="mt-1 font-display text-[28px] text-ink">{s.seats.members + s.seats.pending}<span className="text-[16px] text-muted"> / {s.seats.seats}</span></p>
          <p className="text-[11px] text-faint">{s.seats.members} members · {s.seats.pending} pending invites</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-muted">Credit balance</p>
          <p className={`mt-1 font-display text-[28px] ${s.balance < 0 ? "text-warning" : "text-accent"}`}>{fmt(s.balance)}</p>
          <p className="text-[11px] text-faint">
            {s.overageLimit > 0 ? `Overage on, down to −${fmt(s.overageLimit)}` : "Overage off: requests stop at zero"}
            {a.period_credits > 0 ? ` · ${fmt(a.period_credits)} included per period` : ""}
          </p>
        </Card>
      </div>

      {isAdmin ? (
        <BillingControls
          mode={s.mode}
          seats={s.seats.seats}
          minSeats={s.seats.members}
          seatCheckout={s.seatCheckoutAvailable}
          hasCustomer={Boolean(a.stripe_customer_id)}
          subscriptionActive={["active", "trialing"].includes(a.subscription_status)}
          packs={s.packs}
          overage={{ enabled: a.overage_enabled, limit: s.overageLimit }}
        />
      ) : (
        <Card className="p-4 text-[13px] text-muted">Ask a workspace admin to change seats or buy credits.</Card>
      )}

      <section>
        <h2 className="text-[15px] font-semibold">Period rules</h2>
        <p className="mb-2 text-[12.5px] text-muted">On each renewal the balance becomes the included credits plus {a.rollover_pct}% of what was unused{a.rollover_cap > 0 ? `, up to ${fmt(a.rollover_cap)}` : ""}. Overage already billed is not carried over. Rules are part of your contract.</p>
        <Card className="divide-y divide-line text-[12.5px]">
          {s.history.map((h, i) => (
            <div key={i} className="flex justify-between px-4 py-2">
              <span className="text-muted">{ledgerLabel(h.reason)}</span>
              <span className="flex gap-4"><span className={h.delta >= 0 ? "text-positive" : "text-text"}>{h.delta > 0 ? "+" : ""}{fmt(h.delta)}</span><span className="text-faint">{day(h.at)}</span></span>
            </div>
          ))}
          {!s.history.length ? <p className="px-4 py-3 text-muted">No purchases or resets yet.</p> : null}
        </Card>
      </section>

      {isAdmin ? (
        <section>
          <h2 className="text-[15px] font-semibold">Metered overage</h2>
          <p className="mb-2 text-[12.5px] text-muted">This period: {fmt(s.overageThisPeriod.credits)} credits past zero, {fmt(s.overageThisPeriod.unreported)} not yet sent to Stripe (sent daily).</p>
          <Card className="divide-y divide-line text-[12.5px]">
            {reports.map((r) => (
              <div key={r.identifier} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="text-text">{fmt(r.credits)} credits</span>
                <Badge tone={r.status === "SENT" ? "positive" : r.status === "FAILED" ? "negative" : "neutral"}>{r.status.toLowerCase()}</Badge>
                {r.error ? <span className="text-faint">{r.error}</span> : null}
                <span className="ml-auto text-faint">{new Date(r.at).toLocaleString()}</span>
              </div>
            ))}
            {!reports.length ? <p className="px-4 py-3 text-muted">No overage reported.</p> : null}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
