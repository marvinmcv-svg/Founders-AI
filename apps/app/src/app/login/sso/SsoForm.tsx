"use client";
import { useState, type FormEvent } from "react";
import { buttonClass } from "@founders/ui";
import { authClient } from "@/lib/auth-client";

const input = "h-11 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[14px] text-ink focus:border-accent/60 focus:outline-none";

export function SsoForm({ email, next }: { email: string; next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.sso({ email: String(new FormData(e.currentTarget).get("email")), callbackURL: next, errorCallbackURL: "/login/sso?error=failed" });
    const url = (data as { url?: unknown } | null)?.url;
    if (!error && typeof url === "string") return window.location.assign(url); // to the identity provider
    setBusy(false);
    if (error) setError(error.message?.includes("No provider") || error.status === 404 ? "No single sign-on is set up for that e-mail domain." : (error.message ?? "Could not start single sign-on"));
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label className="text-[13px] text-text" htmlFor="sso-email">Work email</label>
      <input id="sso-email" name="email" type="email" required autoComplete="email" defaultValue={email} className={input} />
      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}
      <button className={buttonClass("primary", "lg", "mt-2")} disabled={busy}>{busy ? "Redirecting…" : "Continue with SSO"}</button>
    </form>
  );
}
