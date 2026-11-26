import type { Metadata } from "next";
import { brand } from "@founders/config";
import { Wordmark } from "@founders/ui";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(216,255,74,0.10),transparent_60%)]" />
      <div className="relative w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-8 text-[28px] font-semibold">Log in to {brand.name}</h1>
        <p className="mt-1 text-[14px] text-muted">Access is by invitation. Ask your workspace admin, or book a demo.</p>
        {sp.error === "no-workspace" ? <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[13px] text-warning">Your account isn't in a workspace yet.</p> : null}
        <LoginForm next={sp.next && sp.next.startsWith("/") ? sp.next : "/companies"} demo={process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGIN === "1"} />
        <a href={`/login/sso${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="mt-3 block text-center text-[13px] text-accent hover:underline">Sign in with SSO</a>
        <p className="mt-6 text-[13px] text-muted">
          New here? <a className="text-accent hover:underline" href={`${brand.urls.www}/contact`}>Book a demo</a>
        </p>
      </div>
    </main>
  );
}
