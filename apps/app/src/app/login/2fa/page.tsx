import type { Metadata } from "next";
import { Wordmark } from "@founders/ui";
import { TwoFactorForm } from "./TwoFactorForm";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function TwoFactor({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="relative w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-8 text-[28px] font-semibold">Two-factor authentication</h1>
        <p className="mt-1 text-[14px] text-muted">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
        <TwoFactorForm next={sp.next && sp.next.startsWith("/") ? sp.next : "/companies"} />
      </div>
    </main>
  );
}
