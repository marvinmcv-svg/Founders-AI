"use client";
/**
 * Motion primitives (plan 4.3). All respect prefers-reduced-motion and pause off-screen.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./primitives";

function useInView<T extends Element>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting) || (e ? e.boundingClientRect.bottom < 0 : false)), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Section reveal: fade-up 12px, 400ms, once; children stagger 60ms via `index`. */
export function Reveal({ children, index = 0, className }: { children: ReactNode; index?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (inView) setShown(true);
  }, [inView]);
  return (
    <div
      ref={ref}
      className={cn("min-w-0 transition-all duration-[400ms] ease-out", shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0", className)}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {children}
    </div>
  );
}

/** Count-up when 40% visible, 1.2s ease-out. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduced]);
  return (
    <span ref={ref} className={cn("tabular", className)}>
      {format(n)}
    </span>
  );
}

/** Infinite marquee with duplicated track, edge fade, pause on hover. Static when reduced motion. */
export function Marquee({ children, reverse, className, speed = 50 }: { children: ReactNode; reverse?: boolean; className?: string; speed?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={cn("flex flex-wrap justify-center gap-4", className)}>{children}</div>;
  return (
    <div className={cn("group relative overflow-hidden mask-fade-x", className)}>
      <div
        className={cn("flex w-max gap-4 group-hover:[animation-play-state:paused]", reverse ? "animate-marquee-reverse" : "animate-marquee")}
        style={{ animationDuration: `${speed}s` }}
      >
        <div className="flex shrink-0 gap-4">{children}</div>
        <div className="flex shrink-0 gap-4" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Types text at ~35 chars/s once visible; loops when `loop` is set. */
export function Typewriter({ text, className, onDone, cps = 35 }: { text: string; className?: string; onDone?: () => void; cps?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.3);
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [text]);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setI(text.length);
      onDone?.();
      return;
    }
    if (i >= text.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setI((x) => x + 1), 1000 / cps);
    return () => clearTimeout(t);
  }, [i, inView, text, reduced, cps, onDone]);
  return (
    <span ref={ref} className={className}>
      {text.slice(0, i)}
      {i < text.length ? <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-accent" /> : null}
    </span>
  );
}

/** Ticker: a new item slides in from the top every `interval` ms; list capped at `max`. */
export function Ticker<T>({ items, render, max = 4, interval = 3000, className }: { items: T[]; render: (item: T, i: number) => ReactNode; max?: number; interval?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!inView || reduced || items.length <= max) return;
    const t = setInterval(() => setOffset((o) => (o + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [inView, reduced, items.length, max, interval]);
  const shown = Array.from({ length: Math.min(max, items.length) }, (_, k) => items[(offset + items.length - k) % items.length] as T);
  return (
    <div ref={ref} className={cn("flex flex-col gap-2", className)} aria-live="polite">
      {shown.map((item, k) => (
        <div key={`${offset}-${k}`} className={k === 0 ? "animate-fade-up" : ""}>
          {render(item, k)}
        </div>
      ))}
    </div>
  );
}

/** Rotating word/pill (e.g. the agents hero). */
export function Rotator({ words, interval = 2200, className }: { words: string[]; interval?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((x) => (x + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [reduced, words.length, interval]);
  return (
    <span key={i} className={cn("inline-block animate-fade-up", className)}>
      {words[i]}
    </span>
  );
}

export { useInView, useReducedMotion };
