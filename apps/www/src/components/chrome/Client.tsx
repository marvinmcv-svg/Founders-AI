"use client";
/** Announcement bar, floating demo pill and cookie consent (plan 5.1, 5.4, 14.5). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { buttonClass, cn, LogoMark } from "@founders/ui";

export function AnnouncementBar({ text, cta, href }: { text: string; cta: string; href: string }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(sessionStorage.getItem("fai-announce") === "1"), []);
  if (hidden) return null;
  return (
    <div className="relative border-b border-line bg-accent-soft text-[13px]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-10 py-2">
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">New</span>
        <span className="text-text">{text}</span>
        <Link href={href} className="text-accent hover:underline">
          {cta} →
        </Link>
      </div>
      <button
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
        aria-label="Dismiss announcement"
        onClick={() => {
          sessionStorage.setItem("fai-announce", "1");
          setHidden(true);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Count comes from /api/public/demo-stats (booking provider); hidden when 0/unavailable. Never fake. */
export function DemoPill({ cta, bookedLabel }: { cta: string; bookedLabel: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [hide, setHide] = useState(false);
  useEffect(() => {
    fetch("/api/public/demo-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bookedToday: number | null } | null) => setCount(d?.bookedToday ?? null))
      .catch(() => setCount(null));
    const footer = document.querySelector("[data-closing-cta]");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHide(Boolean(e?.isIntersecting)), { threshold: 0.1 });
    io.observe(footer);
    return () => io.disconnect();
  }, []);
  return (
    <Link
      href="/contact"
      className={cn(
        "fixed bottom-5 right-5 z-30 flex items-center gap-3 rounded-full border border-line-strong bg-paper/90 py-2 pl-2 pr-4 shadow-[var(--shadow-window)] backdrop-blur-xl transition-all hover:border-accent/50",
        hide && "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <LogoMark size={30} />
      <span className="hidden flex-col leading-tight sm:flex">
        <span className="text-[13px] font-medium text-ink">{cta}</span>
        {count ? <span className="text-[11px] text-muted">{bookedLabel.replace("{n}", String(count))}</span> : null}
      </span>
      <CalendarDays size={16} className="text-accent sm:hidden" />
    </Link>
  );
}

/** Consent banner; analytics only load after opt-in (Consent Mode v2 defaults to denied). */
export function CookieConsent({ text, accept, reject }: { text: string; accept: string; reject: string }) {
  const [choice, setChoice] = useState<string | null>("pending");
  useEffect(() => setChoice(localStorage.getItem("fai-consent")), []);
  useEffect(() => {
    const open = () => setChoice(null);
    window.addEventListener("fai:open-consent", open);
    return () => window.removeEventListener("fai:open-consent", open);
  }, []);
  if (choice !== null) return null;
  const decide = (v: "granted" | "denied") => {
    localStorage.setItem("fai-consent", v);
    setChoice(v);
    window.dispatchEvent(new CustomEvent("fai:consent", { detail: v }));
  };
  return (
    <div role="dialog" aria-label="Cookie consent" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-2xl border border-line-strong bg-paper p-4 shadow-[var(--shadow-window)] sm:left-5 sm:right-auto">
      <p className="text-[13px] text-text">{text}</p>
      <div className="mt-3 flex gap-2">
        <button className={buttonClass("primary", "sm")} onClick={() => decide("granted")}>
          {accept}
        </button>
        <button className={buttonClass("secondary", "sm")} onClick={() => decide("denied")}>
          {reject}
        </button>
      </div>
    </div>
  );
}

export function CookieSettingsLink({ label }: { label: string }) {
  return (
    <button className="text-left text-[13px] text-muted hover:text-ink" onClick={() => window.dispatchEvent(new Event("fai:open-consent"))}>
      {label}
    </button>
  );
}
