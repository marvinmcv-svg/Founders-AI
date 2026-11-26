import type { Metadata } from "next";
import { brand } from "@founders/config";
import { Wordmark } from "@founders/ui";
import { SsoForm } from "./SsoForm";

export const metadata: Metadata = { title: "Single sign-on" };

export default async function SsoLogin({ searchParams }: { searchParams: Promise<{ email?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="relative w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-8 text-[28px] font-semibold">Sign in with SSO</h1>
        <p className="mt-1 text-[14px] text-muted">Use your work e-mail; we'll send you to your company's identity provider.</p>
        {sp.error === "sso-required" ? <p role="alert" className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[13px] text-warning">Your workspace requires single sign-on. Sign in through your identity provider to continue.</p> : null}
        <SsoForm email={sp.email ?? ""} next={sp.next && sp.next.startsWith("/") ? sp.next : "/companies"} />
        <p className="mt-6 text-[13px] text-muted"><a className="text-accent hover:underline" href="/login">Use a password instead</a> · <a className="text-accent hover:underline" href={`${brand.urls.www}/contact`}>Need access?</a></p>
      </div>
    </main>
  );
}
