"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClass } from "@founders/ui";
import { completeSimulatedCheckoutAction } from "@/app/billing-actions";

export function SimulatedPay({ token }: { token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        className={buttonClass("primary", "md")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await completeSimulatedCheckoutAction(token);
            if (!r.ok) return setErr(r.error);
            window.location.assign(r.url ?? "/settings/billing");
          })
        }
      >
        {pending ? "Processing…" : "Pay (simulated)"}
      </button>
      <Link href="/settings/billing?checkout=cancel" className={buttonClass("ghost", "md")}>Cancel</Link>
      {err ? <p className="text-[13px] text-negative">{err}</p> : null}
    </div>
  );
}
