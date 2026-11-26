"use client";
import { useState } from "react";
import { Button } from "@founders/ui";
import { authClient } from "@/lib/auth-client";
import { chooseConsentWorkspace } from "./actions";

/**
 * Allow / Deny. The workspace picked here becomes the session's active organization, which the
 * authorization server stores as the consent reference and puts in the access token (`org` claim).
 */
export function ConsentForm({ orgs, initialOrg, clientName }: { orgs: { id: string; name: string }[]; initialOrg: string; clientName: string }) {
  const [org, setOrg] = useState(initialOrg);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    if (accept && org) {
      const r = await chooseConsentWorkspace(org);
      if (!r.ok) {
        setBusy(false);
        return setError(r.error ?? "Could not select that workspace");
      }
    }
    const { data, error: e } = await authClient.oauth2.consent({ accept });
    if (e) {
      setBusy(false);
      return setError(e.message ?? "Could not complete the connection");
    }
    const url = (data as { url?: unknown } | null)?.url;
    if (typeof url === "string") window.location.href = url;
    else setBusy(false);
  };
  return (
    <div className="mt-5 flex flex-col gap-3">
      {orgs.length > 1 ? (
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Workspace
          <select value={org} onChange={(e) => setOrg(e.target.value)} className="rounded-md border border-line bg-paper px-2.5 py-2 text-[13px] text-ink">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      ) : orgs[0] ? <p className="text-[12.5px] text-muted">Workspace: <span className="text-ink">{orgs[0].name}</span></p> : null}
      {error ? <p className="text-[12.5px] text-negative">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={() => void decide(true)} disabled={busy || !org}>Allow {clientName}</Button>
        <Button variant="ghost" onClick={() => void decide(false)} disabled={busy}>Deny</Button>
      </div>
    </div>
  );
}
