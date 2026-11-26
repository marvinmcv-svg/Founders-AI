"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, buttonClass, Card } from "@founders/ui";
import { createApiKey, inviteMember, sendDigestNow, setApiKeyStatus } from "@/app/actions";

const input = "h-9 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink outline-none focus:border-accent/50";

export function ApiKeys({ keys, isAdmin }: { keys: { id: string; name: string; prefix: string; scopes: string[]; status: string; last_used_at: string | null; user_name: string }[]; isAdmin: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<{ secret: string; status: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; start(async () => { const k = await createApiKey(name.trim()); setSecret({ secret: k.secret, status: k.status }); setName(""); router.refresh(); }); }}>
        <input className={`${input} w-[260px]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. CRM sync" />
        <button className={buttonClass("primary", "sm")} disabled={pending || !name.trim()}>Request key</button>
      </form>
      {secret ? (
        <Card className="border-accent/40 p-3 text-[13px]">
          <p className="text-ink">Copy this key now — it won't be shown again.</p>
          <code className="mt-1 block break-all rounded bg-black/40 p-2 font-mono text-accent">{secret.secret}</code>
          {secret.status === "PENDING" ? <p className="mt-1 text-warning">Pending admin approval.</p> : null}
        </Card>
      ) : null}
      <Card className="divide-y divide-line">
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="text-ink">{k.name}</span>
            <code className="text-[12px] text-muted">{k.prefix}…</code>
            <Badge tone={k.status === "ACTIVE" ? "positive" : k.status === "PENDING" ? "warning" : "neutral"}>{k.status.toLowerCase()}</Badge>
            <span className="text-[12px] text-faint">{k.user_name} · {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}</span>
            <span className="ml-auto flex gap-2">
              {k.status === "PENDING" && isAdmin ? <button className={buttonClass("secondary", "sm")} onClick={() => start(async () => { await setApiKeyStatus(k.id, "ACTIVE"); router.refresh(); })}>Approve</button> : null}
              {k.status !== "REVOKED" ? <button className={buttonClass("danger", "sm")} onClick={() => start(async () => { await setApiKeyStatus(k.id, "REVOKED"); router.refresh(); })}>Revoke</button> : null}
            </span>
          </div>
        ))}
        {!keys.length ? <p className="px-4 py-3 text-[13px] text-muted">No keys yet.</p> : null}
      </Card>
    </div>
  );
}

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin" | "viewer">("member");
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { try { const r = await inviteMember(email, role); if ("error" in r) { setErr(r.error); setLink(null); } else { setLink(`${window.location.origin}${r.link}`); setErr(null); } } catch (x) { setErr((x as Error).message); } }); }}>
        <input type="email" required className={`${input} w-[260px]`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@fund.com" />
        <select className={input} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
        <button className={buttonClass("secondary", "sm")} disabled={pending}>Invite</button>
      </form>
      {link ? <p className="text-[12.5px] text-muted">Invite link (email delivery needs Resend): <code className="break-all text-accent">{link}</code></p> : null}
      {err ? <p className="text-[12.5px] text-negative">{err}</p> : null}
    </div>
  );
}

export function DigestPanel({ runs }: { runs: { id: string; sent_at: string; item_count: number; html: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [show, setShow] = useState<string | null>(runs[0]?.html ?? null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => { await sendDigestNow(); router.refresh(); })}>
          {pending ? "Building…" : "Build digest now"}
        </button>
        {runs.map((r) => (
          <button key={r.id} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink" onClick={() => setShow(r.html)}>
            {new Date(r.sent_at).toLocaleString()} · {r.item_count}
          </button>
        ))}
      </div>
      {show ? <iframe title="Digest preview" srcDoc={show} className="h-[520px] w-full rounded-xl border border-line bg-canvas" sandbox="" /> : <p className="text-[13px] text-muted">No digests yet.</p>}
    </div>
  );
}
