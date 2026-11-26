"use client";
import { useState, useTransition } from "react";
import { Button } from "@founders/ui";
import { setFeatureFlag, activateModel, reviewDisclosure } from "./actions";

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

export function FlagToggle({ flagKey, enabled, orgs, locked }: { flagKey: string; enabled: boolean; orgs: string[]; locked?: boolean }) {
  const [pending, start] = useTransition();
  const [list, setList] = useState(orgs.join(", "));
  const [err, setErr] = useState<string | null>(null);
  const save = (on: boolean) =>
    start(async () => {
      try {
        setErr(null);
        await setFeatureFlag(flagKey, on, list.split(/[\s,]+/).filter(Boolean));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    });
  if (locked) return <p className="text-[12px] text-faint">Locked off: needs legal approval (H8) and customer contracts.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        aria-label={`Org allow-list for ${flagKey}`}
        className="h-8 min-w-[280px] flex-1 rounded-md border border-line bg-white/[0.03] px-2.5 text-[12.5px] text-ink"
        value={list}
        onChange={(e) => setList(e.target.value)}
        placeholder="org_… ids (empty = all workspaces)"
      />
      <Button size="sm" variant={enabled ? "secondary" : "primary"} disabled={pending} onClick={() => save(true)}>
        {enabled ? "Save" : "Turn on"}
      </Button>
      {enabled ? (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => save(false)}>
          Turn off
        </Button>
      ) : null}
      {err ? <span className="text-[12px] text-negative">{err}</span> : null}
    </div>
  );
}
