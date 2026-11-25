import type { Metadata } from "next";
import { Wordmark } from "@founders/ui";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Join your workspace" };

/** Invite flow (plan 7.1b): /signup?invite=<invitationId>&email=… */
export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-8 text-[28px] font-semibold">Join your workspace</h1>
        {sp.invite ? <SignupForm invite={sp.invite} email={sp.email ?? ""} /> : <p className="mt-3 text-muted">You need an invitation link from your workspace admin.</p>}
      </div>
    </main>
  );
}
