"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, Card } from "@founders/ui";
import type { CreditPackId } from "@founders/core/pricing";
import { buyCreditPackAction, changeSeatsAction, openPortalAction, setOverageAction } from "@/app/billing-actions";

const input = "h-9 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink outline-none focus:border-accent/50";

export function BillingControls(props: {
  mode: "live" | "simulated" | "contact_sales";
  seats: number;
  minSeats: number;
  seatCheckout: boolean;
  hasCustomer: boolean;
  subscriptionActive: boolean;
  packs: { id: CreditPackId; credits: number; available: boolean }[];
  overage: { enabled: boolean; limit: number };
}) {
  const router = useRouter();
  const [seats, setSeats] = useState(props.seats);
  const [limit, setLimit] = useState(props.overage.limit || 10_000);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = props.mode === "contact_sales";
  const run = (fn: () => Promise<{ ok: boolean; url?: string; error?: string }>, done?: string) =>
    start(async () => {
      setErr(null);
      setNote(null);
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? "Failed");
      if (r.url) window.location.assign(r.url);
      else {
        if (done) setNote(done);
        router.refresh();
      }
    });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <p className="text-[14px] text-ink">Seats</p>
          <p className="text-[12px] text-muted">Annual, per user. Stripe prorates changes. You can't go below current members ({props.minSeats}).</p>
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => changeSeatsAction(seats), "Seats updated."); }}>
          <input aria-label="Seats" type="number" min={Math.max(1, props.minSeats)} max={10000} className={`${input} w-24`} value={seats} onChange={(e) => setSeats(Number(e.target.value))} disabled={off} />
          <button className={buttonClass("primary", "sm")} disabled={off || pending || !props.seatCheckout || seats === props.seats && props.subscriptionActive}>
            {props.subscriptionActive ? "Update seats" : "Buy seats"}
          </button>
          {props.hasCustomer ? <button type="button" className={buttonClass("secondary", "sm", "ml-auto")} disabled={off || pending} onClick={() => run(openPortalAction)}>Invoices & payment</button> : null}
        </form>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <p className="text-[14px] text-ink">Buy credits</p>
          <p className="text-[12px] text-muted">One-off packs, added as soon as payment clears. Credits don't expire while the subscription is active.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.packs.map((p) => (
            <button key={p.id} className={buttonClass("secondary", "sm")} disabled={off || pending || !p.available} onClick={() => run(() => buyCreditPackAction(p.id))}>
              +{p.credits.toLocaleString("en-US")} credits
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex flex-col gap-3 p-4 md:col-span-2">
        <div>
          <p className="text-[14px] text-ink">Overage</p>
          <p className="text-[12px] text-muted">When on, requests keep working past zero up to the limit below; the credits used past zero are billed on your next invoice. Needs an active subscription.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2 text-muted">Limit <input aria-label="Overage limit" type="number" min={0} step={1000} className={`${input} w-32`} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></label>
          {props.overage.enabled ? (
            <>
              <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => run(() => setOverageAction(true, limit), "Limit saved.")}>Save limit</button>
              <button className={buttonClass("danger", "sm")} disabled={pending} onClick={() => run(() => setOverageAction(false, 0), "Overage off.")}>Turn off</button>
            </>
          ) : (
            <button className={buttonClass("primary", "sm")} disabled={pending || !props.subscriptionActive} onClick={() => run(() => setOverageAction(true, limit), "Overage on.")}>Turn on overage</button>
          )}
        </div>
      </Card>
      {err ? <p className="text-[13px] text-negative md:col-span-2" role="alert">{err}</p> : null}
      {note ? <p className="text-[13px] text-positive md:col-span-2">{note}</p> : null}
    </div>
  );
}
