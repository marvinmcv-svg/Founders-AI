"use client";
import { useEffect } from "react";
import { EVENTS, track, type EventName } from "@/lib/analytics";

/** Sends a consent-gated event for any click on an element with data-track="<event>" (optional data-track-label). */
export function AnalyticsListener() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
      const name = el?.dataset.track;
      if (!el || !name || !(EVENTS as readonly string[]).includes(name)) return;
      track(name as EventName, { label: el.dataset.trackLabel ?? el.textContent?.trim() ?? "" });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
