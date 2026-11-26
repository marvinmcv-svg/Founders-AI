"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClass } from "@founders/ui";
import { authClient } from "@/lib/auth-client";

const input = "h-11 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[14px] text-ink focus:border-accent/60 focus:outline-none";

export function LoginForm({ next, demo }: { next: string; demo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
    setBusy(false);
    if (error) return setError(error.message ?? "Could not sign in");
    // Signing in during an MCP/OAuth authorization: the server answers with the next step of that flow.
    const oauthUrl = (data as { url?: unknown } | null)?.url;
    if (new URLSearchParams(window.location.search).has("sig") && typeof oauthUrl === "string") window.location.href = oauthUrl;
    else router.push(next);
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label className="text-[13px] text-text" htmlFor="email">Work email</label>
      <input id="email" name="email" type="email" required autoComplete="email" defaultValue={demo ? "demo@foundersscz.com" : ""} className={input} />
      <label className="mt-1 text-[13px] text-text" htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required autoComplete="current-password" defaultValue={demo ? "founders-demo" : ""} className={input} />
      {error ? <p className="text-[13px] text-negative">{error}</p> : null}
      <button className={buttonClass("primary", "lg", "mt-2")} disabled={busy}>
        {busy ? "Signing in…" : "Log in"}
      </button>
      {demo ? <p className="text-[12px] text-faint">Local demo credentials are pre-filled.</p> : null}
    </form>
  );
}
