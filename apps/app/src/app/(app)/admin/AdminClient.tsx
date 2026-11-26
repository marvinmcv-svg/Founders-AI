"use client";
import { useState, useTransition } from "react";
import { Button } from "@founders/ui";
import { activateModel, reviewDisclosure } from "./actions";

export function ReviewButtons({ id, amount }: { id: string; amount: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(amount));
  const [error, setError] = useState<string | null>(null);
  const act = (d: "verified" | "rejected") =>
    start(async () => {
      try {
        setError(null);
        await reviewDisclosure(id, d, Number(value));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  return (
    <div className="flex items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`amt-${id}`}>Verified amount (USD)</label>
      <input
        id={`amt-${id}`}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-28 rounded-md border border-line bg-transparent px-2 py-1 text-right text-[12px] tabular"
        inputMode="numeric"
      />
      <Button size="sm" disabled={pending} onClick={() => act("verified")}>Approve</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("rejected")}>Reject</Button>
      {error ? <span className="text-[12px] text-negative">{error}</span> : null}
    </div>
  );
}

export function ActivateButton({ version }: { version: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => activateModel(version))}>
      {pending ? "Switching…" : "Make active"}
    </Button>
  );
}
