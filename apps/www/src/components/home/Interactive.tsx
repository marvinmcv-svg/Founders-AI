"use client";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { CountUp } from "@founders/ui/motion";
import { cn } from "@founders/ui";

/** Mission lines that light up word by word as they scroll through the viewport. */
export function ScrollLitText({ lines, className }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = lines.flatMap((l, li) => l.split(" ").map((w, wi) => ({ w, key: `${li}-${wi}`, line: li })));
  return (
    <div ref={ref} className={className}>
      {lines.map((_, li) => (
        <p key={li} className="block">
          {words
            .map((x, i) => ({ ...x, i }))
            .filter((x) => x.line === li)
            .map((x) => (
              <Word key={x.key} progress={scrollYProgress} range={[x.i / words.length, (x.i + 1) / words.length]} reduced={reduced} accent={li === lines.length - 1}>
                {x.w}
              </Word>
            ))}
        </p>
      ))}
    </div>
  );
}

function Word({ children, progress, range, reduced, accent }: { children: string; progress: MotionValue<number>; range: [number, number]; reduced: boolean; accent: boolean }) {
  const opacity = useTransform(progress, range, reduced ? [1, 1] : [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className={cn("mr-[0.25em] inline-block", accent && "text-accent")}>
      {children}
    </motion.span>
  );
}

/** Card with a lime spotlight that follows the pointer. */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, rgba(216,255,74,0.10), transparent 70%)`;
  const border = useMotionTemplate`radial-gradient(300px circle at ${x}px ${y}px, rgba(216,255,74,0.55), transparent 70%)`;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - r.left);
    y.set(e.clientY - r.top);
  };
  return (
    <div onPointerMove={onMove} onPointerLeave={() => (x.set(-400), y.set(-400))} className={cn("group relative overflow-hidden rounded-[20px] border border-line bg-paper", className)}>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[20px] p-px [mask-composite:exclude] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)]" style={{ background: border }} />
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: bg }} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/**
 * Live stat: counts up when the value is a number like "12K+" or "1.2M+"; renders words as-is
 * (the DB-unreachable fallback is words, never invented numbers).
 */
export function LiveStat({ value, className }: { value: string; className?: string }) {
  const m = /^([\d.,]+)([KMB]?)(\+?)$/.exec(value.trim());
  if (!m) return <span className={className}>{value}</span>;
  const n = Number((m[1] ?? "0").replace(/,/g, ""));
  const decimals = (m[1] ?? "").includes(".") ? 1 : 0;
  const suffix = `${m[2] ?? ""}${m[3] ?? ""}`;
  return <CountUp className={className} value={n} format={(v) => `${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`} />;
}
