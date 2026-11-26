"use client";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

/**
 * Home hero stage: receding lime grid, cursor-follow glow, staggered headline,
 * orbiting signal chips and a product window that tilts flat as you scroll.
 * Decorative layers are aria-hidden; all motion is disabled under reduced motion.
 */
export function HeroStage({
  eyebrow,
  lines,
  sub,
  live,
  chips,
  ctas,
  scrollLabel,
  children,
}: {
  eyebrow: string;
  lines: [string, string, string];
  sub: string;
  live: string;
  chips: string[];
  ctas: ReactNode;
  scrollLabel: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  const stage = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(50);
  const my = useMotionValue(30);
  const glow = useMotionTemplate`radial-gradient(600px circle at ${mx}% ${my}%, rgba(216,255,74,0.16), transparent 60%)`;

  const { scrollYProgress } = useScroll({ target: stage, offset: ["start start", "end start"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const tilt = useTransform(smooth, [0, 0.45], reduced ? [0, 0] : [24, 0]);
  const scale = useTransform(smooth, [0, 0.45], reduced ? [1, 1] : [0.88, 1]);
  const lift = useTransform(smooth, [0, 0.45], reduced ? [0, 0] : [60, 0]);
  const fade = useTransform(smooth, [0, 0.25], [1, 0]);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  const word = {
    hidden: { opacity: 0, y: reduced ? 0 : 40, filter: reduced ? "blur(0px)" : "blur(10px)" },
    show: (i: number) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: 0.15 + i * 0.12, duration: 0.8, ease: [0.22, 1, 0.36, 1] as const } }),
  };

  return (
    <div ref={stage} onPointerMove={onMove} className="relative isolate overflow-hidden">
      {/* Receding grid floor */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-[30%] -z-10 [perspective:900px]">
        <div className="hero-grid absolute inset-x-[-50%] bottom-[-10%] top-0 origin-bottom [transform:rotateX(62deg)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--color-canvas)_0%,transparent_35%,transparent_70%,var(--color-canvas)_100%)]" />
      </div>
      {/* Cursor glow + top aurora */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: glow }} />
      <div aria-hidden className="hero-aurora pointer-events-none absolute left-1/2 top-[-280px] -z-10 h-[620px] w-[1100px] -translate-x-1/2 rounded-full" />
      {/* Giant outlined mark */}
      <div aria-hidden className="pointer-events-none absolute right-[-6%] top-[8%] -z-10 select-none font-display text-[46vw] font-bold leading-none text-transparent opacity-[0.07] [-webkit-text-stroke:2px_#d8ff4a] md:text-[34vw]">
        F.
      </div>

      <div className="relative mx-auto flex max-w-[1240px] flex-col items-center px-5 pb-6 pt-14 text-center md:pt-20">
        <motion.p
          initial={{ opacity: 0, y: reduced ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-3.5 py-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-accent"
        >
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
          {eyebrow}
        </motion.p>

        <h1 className="mt-7 max-w-[1100px] text-balance font-display text-[46px] font-semibold leading-[0.95] tracking-[-0.045em] sm:text-[64px] md:text-[84px] lg:text-[100px]">
          {lines.map((l, i) => (
            <motion.span
              key={l}
              custom={i}
              initial="hidden"
              animate="show"
              variants={word}
              className={i === 2 ? "hero-shine block bg-clip-text text-transparent" : "block"}
            >
              {l}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          className="mt-7 max-w-2xl text-pretty text-[17px] leading-relaxed text-muted md:text-[19px]"
        >
          {sub}
        </motion.p>

        <motion.div initial={{ opacity: 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.7 }} className="mt-9 flex flex-wrap justify-center gap-3">
          {ctas}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.8 }} className="mt-6 inline-flex items-center gap-2 text-[13px] text-faint">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
          </span>
          {live}
        </motion.p>

        <motion.div aria-hidden style={{ opacity: fade }} className="mt-10 hidden flex-col items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-faint md:flex">
          {scrollLabel}
          <span className="h-10 w-px overflow-hidden bg-line">
            <span className="block h-1/2 w-px animate-[scroll-line_1.8s_ease-in-out_infinite] bg-accent" />
          </span>
        </motion.div>
      </div>

      {/* Product window with orbiting chips */}
      <div className="relative mx-auto max-w-[1240px] px-5 pb-20 [perspective:1600px]">
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          {chips.map((c, i) => (
            <motion.span
              key={c}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={reduced ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -10, 0] }}
              transition={reduced ? { delay: 1 + i * 0.15 } : { opacity: { delay: 1.1 + i * 0.15 }, scale: { delay: 1.1 + i * 0.15 }, y: { duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 } }}
              className="absolute z-20 inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised/90 px-3.5 py-2 text-[12.5px] text-ink shadow-[var(--shadow-window)] backdrop-blur"
              style={CHIP_POS[i % CHIP_POS.length]}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {c}
            </motion.span>
          ))}
        </div>
        <motion.div style={{ rotateX: tilt, scale, y: lift, transformOrigin: "50% 0%" }} className="relative">
          <div aria-hidden className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgba(216,255,74,0.18),transparent_65%)] blur-2xl" />
          <div className="rounded-[18px] border border-line-strong bg-paper/70 p-2 shadow-[0_40px_120px_rgba(0,0,0,0.7)] backdrop-blur">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

const CHIP_POS: CSSProperties[] = [
  { left: "-1%", top: "6%" },
  { right: "-1%", top: "14%" },
  { left: "3%", top: "52%" },
  { right: "2%", top: "60%" },
  { left: "38%", bottom: "-3%" },
];
