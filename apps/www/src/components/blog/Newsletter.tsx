"use client";
import { useState, type FormEvent } from "react";
import { buttonClass, cn } from "@founders/ui";

export type NewsletterCopy = { title: string; body: string; placeholder: string; cta: string; done: string; error: string };

/** Weekly-letter signup (plan 6.17). Stored as a NEWSLETTER lead until the email provider is connected (H3). */
export function Newsletter({ copy, className }: { copy: NewsletterCopy; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("busy");
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "NEWSLETTER", email: f.get("email"), website: f.get("website") }) }).catch(() => null);
    setState(r?.ok ? "done" : "error");
  };
  return (
    <div data-newsletter className={cn("rounded-[24px] border border-line bg-paper p-6 md:p-8", className)}>
      <h3 className="text-[22px] font-semibold tracking-[-0.02em]">{copy.title}</h3>
      <p className="mt-2 max-w-xl text-[15px] text-muted">{copy.body}</p>
      {state === "done" ? (
        <p role="status" className="mt-5 text-[15px] text-accent">
          {copy.done}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 flex max-w-lg flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="nl-email">
            {copy.placeholder}
          </label>
          <input id="nl-email" name="email" type="email" required placeholder={copy.placeholder} className="h-12 flex-1 rounded-full border border-line-strong bg-sunken px-5 text-[15px] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none" />
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <button type="submit" disabled={state === "busy"} className={buttonClass("primary", "lg")}>
            {copy.cta}
          </button>
        </form>
      )}
      {state === "error" ? (
        <p role="alert" className="mt-2 text-[13px] text-negative">
          {copy.error}
        </p>
      ) : null}
    </div>
  );
}
