/**
 * Page kit for the R2 product pages, in the home page's visual language.
 * Every block carries data-section (structural-parity test) and reads text from copy keys.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { buttonClass, cn } from "@founders/ui";
import { Reveal } from "@founders/ui/motion";
import { SpotlightCard } from "@/components/home/Interactive";
import { t, tObjects, type Vars } from "@/lib/copy";
import { appUrl } from "@/lib/nav";

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-accent", className)}>
      <span className="h-px w-6 bg-accent" />
      {children}
    </p>
  );
}

/** Left-aligned product hero with a glowing product mock underneath. */
export function ProductHero({ id, prefix, vars, children, secondary }: { id: string; prefix: string; vars?: Vars; children?: ReactNode; secondary?: { label: string; href: string } }) {
  return (
    <section data-section={id} className="relative isolate overflow-hidden">
      <div aria-hidden className="hero-aurora pointer-events-none absolute left-1/2 top-[-300px] -z-10 h-[560px] w-[1000px] -translate-x-1/2 rounded-full" />
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.25] [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
      <div className="mx-auto max-w-[1240px] px-5 pb-12 pt-16 md:pt-24">
        <Kicker>{t(`${prefix}.eyebrow`, vars)}</Kicker>
        <h1 className="mt-6 max-w-5xl text-balance font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] md:text-[80px]">
          {t(`${prefix}.h1`, vars)} <span className="hero-shine bg-clip-text text-transparent">{t(`${prefix}.h1Accent`, vars)}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-[17px] leading-relaxed text-muted md:text-[19px]">{t(`${prefix}.sub`, vars)}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a href={appUrl("/signup")} data-track="cta_open_app" className={buttonClass("primary", "lg", "group shadow-[0_0_40px_rgba(216,255,74,0.3)]")}>
            {t("global.cta.openApp")}
            <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
          </a>
          {secondary ? (
            secondary.href.startsWith("http") ? (
              <a href={secondary.href} className={buttonClass("secondary", "lg")}>
                {secondary.label}
              </a>
            ) : (
              <Link href={secondary.href} className={buttonClass("secondary", "lg")}>
                {secondary.label}
              </Link>
            )
          ) : (
            <Link href="/contact" data-track="cta_book_demo" className={buttonClass("secondary", "lg")}>
              {t("global.cta.bookDemo")}
            </Link>
          )}
        </div>
      </div>
      {children ? (
        <div className="relative mx-auto max-w-[1240px] px-5 pb-16">
          <div aria-hidden className="absolute -inset-x-10 top-0 bottom-10 -z-10 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgba(216,255,74,0.14),transparent_65%)] blur-2xl" />
          <Reveal>
            <div className="rounded-[18px] border border-line-strong bg-paper/70 p-2 shadow-[0_40px_120px_rgba(0,0,0,0.65)] backdrop-blur">{children}</div>
          </Reveal>
        </div>
      ) : null}
    </section>
  );
}

/** Standard section: kicker + H2 + optional lede, then content. */
export function Block({ id, prefix, vars, children, anchor, center, aside, className }: { id: string; prefix: string; vars?: Vars; children?: ReactNode; anchor?: string; center?: boolean; aside?: ReactNode; className?: string }) {
  const lede = t(`${prefix}.lede`, vars);
  const hasLede = !lede.startsWith("[TODO-COPY");
  return (
    <section data-section={id} id={anchor} className={cn("mx-auto max-w-[1240px] px-5 py-20 md:py-28", className)}>
      <div className={cn("flex flex-col gap-6", center ? "items-center text-center" : "md:flex-row md:items-end md:justify-between")}>
        <div className={cn("max-w-3xl", center && "mx-auto")}>
          <Kicker className={center ? "justify-center" : undefined}>{t(`${prefix}.eyebrow`, vars)}</Kicker>
          <h2 className="mt-5 text-balance text-[34px] font-semibold leading-[1.03] tracking-[-0.035em] md:text-[56px]">{t(`${prefix}.h2`, vars)}</h2>
          {hasLede && center ? <p className="mx-auto mt-5 max-w-2xl text-[17px] text-muted">{lede}</p> : null}
        </div>
        {hasLede && !center ? <p className="max-w-sm text-[16px] leading-relaxed text-muted">{lede}</p> : null}
        {aside}
      </div>
      {children ? <div className="mt-12">{children}</div> : null}
    </section>
  );
}

export type CardItem = { title: string; body: string; tag?: string };

/** Spotlight cards from a copy array (`<prefix>.cards`). */
export function CardGrid({ prefix, vars, cols = 4, icons }: { prefix: string; vars?: Vars; cols?: 2 | 3 | 4; icons?: ReactNode[] }) {
  const items = tObjects<CardItem>(`${prefix}.cards`);
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", cols === 3 && "lg:grid-cols-3", cols === 4 && "lg:grid-cols-4")}>
      {items.map((c, i) => (
        <Reveal key={c.title} index={i} className="h-full">
          <SpotlightCard className="flex h-full flex-col p-6">
            <div className="flex items-center justify-between">
              {icons?.[i] ? <span className="grid h-9 w-9 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">{icons[i]}</span> : <span className="font-display text-[13px] text-faint">{String(i + 1).padStart(2, "0")}</span>}
              {c.tag ? <span className="rounded-full border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-muted">{fillVars(c.tag, vars)}</span> : null}
            </div>
            <h3 className="mt-8 text-[20px] font-semibold leading-snug tracking-[-0.02em]">{fillVars(c.title, vars)}</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{fillVars(c.body, vars)}</p>
          </SpotlightCard>
        </Reveal>
      ))}
    </div>
  );
}

function fillVars(s: string, vars?: Vars) {
  return vars ? s.replace(/\{([\w.]+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k]))) : s;
}

/** Big stat tiles (values already formatted). */
export function StatTiles({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-line bg-line", items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {items.map((s) => (
        <div key={s.label} className="bg-canvas p-6 md:p-8">
          <p className="font-display text-[34px] font-semibold leading-tight tracking-[-0.04em] text-ink first-letter:uppercase md:text-[44px]">{s.value}</p>
          <p className="mt-2 text-[14px] text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Closing band: big headline, open-app + demo CTAs. */
export function CtaBand({ id, h2, body }: { id: string; h2: string; body: string }) {
  return (
    <section data-section={id} data-closing-cta className="mx-auto max-w-[1240px] px-5 pb-10 pt-10">
      <div className="relative overflow-hidden rounded-[32px] border border-line-strong bg-paper px-6 py-20 text-center md:px-16 md:py-24">
        <div aria-hidden className="hero-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(216,255,74,0.22),transparent_60%)]" />
        <div className="relative flex flex-col items-center">
          <h2 className="max-w-4xl text-balance font-display text-[40px] font-semibold leading-[0.98] tracking-[-0.04em] md:text-[72px]">{h2}</h2>
          <p className="mt-6 max-w-2xl text-[17px] text-muted">{body}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href={appUrl("/signup")} data-track="cta_open_app" className={buttonClass("primary", "lg", "group shadow-[0_0_40px_rgba(216,255,74,0.35)]")}>
              {t("global.cta.openApp")}
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </a>
            <Link href="/contact" data-track="cta_book_demo" className={buttonClass("secondary", "lg")}>
              {t("global.cta.bookDemo")}
            </Link>
          </div>
          <p className="mt-8 text-[12px] text-faint">{t("global.demoData")}</p>
        </div>
      </div>
    </section>
  );
}

/** Two-column row: copy on one side, a mock on the other. */
export function Split({ id, prefix, vars, children, reverse, anchor, bullets }: { id: string; prefix: string; vars?: Vars; children: ReactNode; reverse?: boolean; anchor?: string; bullets?: boolean }) {
  const lede = t(`${prefix}.lede`, vars);
  const list = bullets ? tObjects<CardItem>(`${prefix}.cards`) : [];
  return (
    <section data-section={id} id={anchor} className="mx-auto max-w-[1240px] px-5 py-20 md:py-28">
      <div className={cn("grid items-center gap-12 lg:grid-cols-[1fr_1.25fr]", reverse && "lg:[&>*:first-child]:order-2")}>
        <div>
          <Kicker>{t(`${prefix}.eyebrow`, vars)}</Kicker>
          <h2 className="mt-5 text-balance text-[34px] font-semibold leading-[1.03] tracking-[-0.035em] md:text-[52px]">{t(`${prefix}.h2`, vars)}</h2>
          {lede.startsWith("[TODO-COPY") ? null : <p className="mt-5 text-[17px] leading-relaxed text-muted">{lede}</p>}
          {list.length ? (
            <ul className="mt-8 flex flex-col gap-4">
              {list.map((c) => (
                <li key={c.title} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    <span className="font-medium text-ink">{fillVars(c.title, vars)}</span>
                    <span className="text-muted"> — {fillVars(c.body, vars)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Reveal>{children}</Reveal>
      </div>
    </section>
  );
}
