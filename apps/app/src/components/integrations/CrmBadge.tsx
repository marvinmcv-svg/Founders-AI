"use client";
/** CRM status badges (plan 7.3 / 13.1): In CRM · In CRM, not enriched · Not synced; profile push card. */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Badge, buttonClass } from "@founders/ui";
import { pushEntitiesToCrm } from "@/app/integration-actions";

export type CrmBadgeData = { status: "IN_CRM" | "NOT_ENRICHED"; providers: string[]; owner: string | null; stage: string | null; openDeals: number; lastActivity: string | null };

const label = (p: string) => p.charAt(0) + p.slice(1).toLowerCase();

export function CrmDot({ badge }: { badge: CrmBadgeData }) {
  const title = `${badge.status === "IN_CRM" ? "In CRM" : "In CRM, not enriched"} (${badge.providers.map(label).join(", ")})${badge.owner ? ` · owner ${badge.owner}` : ""}${badge.stage ? ` · ${badge.stage}` : ""}`;
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex h-[18px] shrink-0 items-center rounded px-1 text-[10px] font-semibold uppercase tracking-wide ${badge.status === "IN_CRM" ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-muted"}`}
    >
      CRM
    </span>
  );
}

/** Profile header: CRM state plus a one-click push (create-or-update by domain / LinkedIn). */
export function CrmProfileCard({ kind, id, badge: initial, target, canWrite }: { kind: "COMPANY" | "PERSON"; id: string; badge: CrmBadgeData | null; target: string | null; canWrite: boolean }) {
  const [badge, setBadge] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      {badge ? (
        <Badge tone={badge.status === "IN_CRM" ? "positive" : "neutral"}>{badge.status === "IN_CRM" ? "In CRM" : "In CRM · not enriched"}</Badge>
      ) : (
        <Badge tone="neutral">Not synced</Badge>
      )}
      {badge?.owner ? <span className="text-muted">Owner {badge.owner}</span> : null}
      {badge?.stage ? <span className="text-muted">· {badge.stage}</span> : null}
      {badge?.openDeals ? <span className="text-muted">· {badge.openDeals} open deal{badge.openDeals === 1 ? "" : "s"}</span> : null}
      {target && canWrite ? (
        <button
          className={buttonClass("secondary", "sm")}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pushEntitiesToCrm(kind, [id], target);
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.error });
            if (r.data.errors) return setMsg({ ok: false, text: r.data.message ?? "Could not push" });
            setMsg({ ok: true, text: `${r.data.created ? "Created" : "Updated"} in ${label(target)}` });
            setBadge((b) => ({ providers: [target], owner: null, stage: null, openDeals: 0, lastActivity: null, ...(b ?? {}), status: "IN_CRM" }));
          }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Push to {label(target)}
        </button>
      ) : null}
      {msg ? <span role="status" className={msg.ok ? "text-positive" : "text-negative"}>{msg.text}</span> : null}
    </div>
  );
}
