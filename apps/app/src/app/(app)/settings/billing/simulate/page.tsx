import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { billingConfig, getStripe, SimulatedStripe } from "@founders/core/billing";
import { CREDIT_PACKS } from "@founders/core/pricing";
import { Badge, Card } from "@founders/ui";
import { getCtx } from "@/lib/session";
import { SimulatedPay } from "./SimulatedPay";

export const metadata: Metadata = { title: "Checkout (simulator)" };

/** Stands in for Stripe Checkout when BILLING_SIMULATOR=1 (no Stripe key). 404 otherwise. */
export default async function Simulate({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const ctx = await getCtx();
  const stripe = getStripe();
  if (billingConfig().mode !== "simulated" || !(stripe instanceof SimulatedStripe)) notFound();
  const { s = "" } = await searchParams;
  let session: { mode: string; quantity: number; metadata: Record<string, string> };
  try {
    session = stripe.open(s) as typeof session;
  } catch {
    notFound();
  }
  if (session.metadata.org_id !== ctx.orgId) notFound();
  const pack = CREDIT_PACKS.find((p) => p.id === session.metadata.pack);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-10">
      <Badge tone="info" className="self-start">Billing simulator</Badge>
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-[13px] text-muted">{ctx.orgName}</p>
        <p className="text-[20px] text-ink">
          {session.mode === "subscription" ? `${session.quantity} platform seat${session.quantity === 1 ? "" : "s"}, billed annually` : `${(pack?.credits ?? 0).toLocaleString("en-US")} API credits`}
        </p>
        <p className="text-[12.5px] text-muted">No card is charged. Confirming sends the same signed webhook events Stripe sends after a real checkout.</p>
        <SimulatedPay token={s} />
      </Card>
    </div>
  );
}
