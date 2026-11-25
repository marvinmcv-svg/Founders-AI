"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClass } from "@founders/ui";
import { authClient } from "@/lib/auth-client";

const input = "h-11 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[14px] text-ink focus:border-accent/60 focus:outline-none";

export function SignupForm({ invite, email }: { invite: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await authClient.signUp.email({ email: String(fd.get("email")), password: String(fd.get("password")), name: String(fd.get("name")) });
    if (r.error) return setError(r.error.message ?? "Could not create account");
    const a = await authClient.organization.acceptInvitation({ invitationId: invite });
    if (a.error) return setError(a.error.message ?? "Could not accept invitation");
    router.push("/onboarding");
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <input name="name" required placeholder="Full name" className={input} />
      <input name="email" type="email" required defaultValue={email} placeholder="Work email" className={input} />
      <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className={input} />
      {error ? <p className="text-[13px] text-negative">{error}</p> : null}
      <button className={buttonClass("primary", "lg")}>Create account</button>
    </form>
  );
}
