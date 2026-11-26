"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClass } from "@founders/ui";
import { authClient } from "@/lib/auth-client";

const input = "h-11 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[16px] tracking-widest text-ink focus:border-accent/60 focus:outline-none";

export function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code")).trim();
    const trustDevice = fd.get("trust") === "on";
    setBusy(true);
    setError(null);
    const { error } = backup ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice }) : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setBusy(false);
    if (error) return setError(error.message ?? "That code didn't match");
    router.push(next);
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label className="text-[13px] text-text" htmlFor="code">{backup ? "Backup code" : "Authentication code"}</label>
      <input id="code" name="code" required autoFocus inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" className={input} />
      <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" name="trust" /> Trust this device for 30 days</label>
      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}
      <button className={buttonClass("primary", "lg", "mt-2")} disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
      <button type="button" className="text-left text-[13px] text-accent hover:underline" onClick={() => setBackup(!backup)}>{backup ? "Use an authenticator code" : "Use a backup code"}</button>
    </form>
  );
}
