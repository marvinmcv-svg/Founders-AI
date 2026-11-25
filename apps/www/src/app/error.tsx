"use client";
import { buttonClass } from "@founders/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section data-section="500.main" className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-5 py-32 text-center">
      <p className="font-display text-[96px] font-semibold leading-none text-accent">500</p>
      <h1 className="text-[36px] font-semibold">Something broke on our side.</h1>
      <p className="text-muted">We've been notified. Try again in a moment.</p>
      <button className={buttonClass("primary")} onClick={reset}>
        Try again
      </button>
    </section>
  );
}
