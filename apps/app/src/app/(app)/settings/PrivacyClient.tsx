"use client";
import { useState, useTransition } from "react";
import { buttonClass, Card } from "@founders/ui";
import { deleteMyAccountAction } from "@/app/privacy-actions";

export function PrivacyPanel({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-muted">Your lists, searches and notes are visible only inside your workspaces. Profiles of people in our data can ask for access or deletion on the public privacy-rights page.</p>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1">
          <p className="text-ink">Export my data</p>
          <p className="text-[12px] text-muted">Your account, memberships, lists, saved searches, notes, keys (metadata), agent threads and sessions, as JSON.</p>
        </div>
        <a href="/api/privacy/export" className={buttonClass("secondary", "sm")}>Download JSON</a>
      </Card>
      <Card className="flex flex-col gap-3 border-negative/30 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <p className="text-ink">Delete my account</p>
            <p className="text-[12px] text-muted">Removes your login, private lists and searches, network sources and keys. Team lists and notes stay with the workspace. If you are a workspace's only admin, make someone else an admin first.</p>
          </div>
          {!open ? <button className={buttonClass("danger", "sm")} onClick={() => setOpen(true)}>Delete account…</button> : null}
        </div>
        {open ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await deleteMyAccountAction(confirm);
                if (!r.ok) return setErr(r.error);
                window.location.assign("/login?deleted=1");
              });
            }}
          >
            <input aria-label="Type your e-mail to confirm" className="h-9 w-72 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink" placeholder={email} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className={buttonClass("danger", "sm")} disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}>{pending ? "Deleting…" : "Permanently delete"}</button>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>Cancel</button>
          </form>
        ) : null}
        {err ? <p className="text-[12.5px] text-negative" role="alert">{err}</p> : null}
      </Card>
    </div>
  );
}
