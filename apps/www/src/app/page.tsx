import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Bot, Plug, Sparkles } from "lucide-react";
import { brand } from "@founders/config";
import { buttonClass, cn } from "@founders/ui";
import { Marquee, Reveal } from "@founders/ui/motion";
import { CompaniesDbMock, FIX } from "@founders/mocks";
import { ApiTerminal, NlSearchDemo, SignalTicker } from "@founders/mocks/animated";
import { HeroStage } from "@/components/home/HeroStage";
import { LiveStat, ScrollLitText, SpotlightCard } from "@/components/home/Interactive";
import { t, tList, tObjects } from "@/lib/copy";
import { appUrl } from "@/lib/nav";
import { getStatVars, isNumericStat } from "@/lib/stats";

export const revalidate = 600;

/** Founders ecosystem destinations (all real, owner-run). */
const PROGRAM_APPLY = "https://foundersscz.com/aplicar";
const GET_INVOLVED = "https://foundersscz.com/mentores-e-inversores";

type Post = { text: string; date: string; url: string };
type Beat = { cadence: string; title: string; body: string };

function Eyebrow({ children, className }: { children: string; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-accent", className)}>
      <span className="h-px w-6 bg-accent" />
      {children}
    </p>
  );
}

export default async function Home() {
  const vars = await getStatVars();
  const ticker = FIX.talent.map((s, i) => ({
    title: String(s.person_name),
    body: String(s.summary),
    category: String(s.type).replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    time: ["now", "4 min", "22 min", "1 hr", "2 hr", "3 hr"][i % 6] ?? "today",
  }));
  const chips = tList("home.hero.chips");
  const eco = [
    { k: "program", href: PROGRAM_APPLY, n: "01" },
    { k: "academy", href: brand.urls.academy, n: "02" },
    { k: "community", href: brand.social.instagram, n: "03" },
    { k: "ai", href: appUrl("/signup"), n: "04", featured: true },
  ];
  const stats = ["companies", "people", "investors", "transactions"] as const;
  const posts = tObjects<Post>("home.social.posts");
  const rhythm = tObjects<Beat>("home.ecosystem.rhythm");

  return (
    <>
      {/* 1 — Hero */}
      <section data-section="home.hero">
        <HeroStage
          eyebrow={t("home.hero.eyebrow")}
          lines={[t("home.hero.h1a"), t("home.hero.h1b"), t("home.hero.h1c")]}
          sub={t("home.hero.sub")}
          live={t("home.hero.live", vars)}
          chips={chips}
          scrollLabel={t("home.hero.scroll")}
          ctas={
            <>
              <a href={appUrl("/signup")} className={buttonClass("primary", "lg", "group h-14 px-8 text-[16px] shadow-[0_0_40px_rgba(216,255,74,0.35)]")}>
                {t("home.hero.cta")}
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </a>
              <Link href="/platform" className={buttonClass("secondary", "lg", "h-14 px-8 text-[16px]")}>
                {t("home.hero.secondary")}
              </Link>
            </>
          }
        >
          <CompaniesDbMock count={String(vars["stats.companies"] ?? "")} />
        </HeroStage>
      </section>

      {/* 2 — Mission */}
      <section data-section="home.manifesto" className="relative mx-auto max-w-[1240px] px-5 py-28 md:py-40">
        <Eyebrow>{t("home.manifesto.eyebrow")}</Eyebrow>
        <ScrollLitText lines={tList("home.manifesto.lines")} className="mt-8 font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] text-ink sm:text-[64px] md:text-[96px]" />
        <div className="mt-14 grid gap-10 border-t border-line pt-10 md:grid-cols-[1fr_1.2fr]">
          <p className="font-serif text-[26px] italic leading-snug text-muted md:text-[30px]">“{t("home.manifesto.es")}”</p>
          <p className="text-[17px] leading-relaxed text-text md:text-[19px]">{t("home.manifesto.body")}</p>
        </div>
      </section>

      {/* 3 — Ecosystem marquee */}
      <section data-section="home.marquee" aria-hidden className="relative -rotate-[1.5deg] border-y border-accent/30 bg-accent py-5 text-accent-ink">
        <Marquee speed={35} className="[mask-image:none]">
          {tList("home.marquee").map((m) => (
            <span key={m} className="flex items-center gap-8 pr-4 font-display text-[34px] font-semibold uppercase tracking-[-0.02em] md:text-[52px]">
              {m}
              <span className="text-[28px] md:text-[40px]">✳</span>
            </span>
          ))}
        </Marquee>
      </section>

      {/* 4 — Ecosystem */}
      <section data-section="home.ecosystem" className="mx-auto max-w-[1240px] px-5 py-28 md:py-36">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <Eyebrow>{t("home.ecosystem.eyebrow")}</Eyebrow>
            <h2 className="mt-5 text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[64px]">{t("home.ecosystem.h2")}</h2>
          </div>
          <p className="max-w-sm text-[16px] text-muted">{t("home.ecosystem.lede")}</p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {eco.map((e, i) => (
            <Reveal key={e.k} index={i} className="h-full">
              <a href={e.href} target={e.k === "ai" ? undefined : "_blank"} rel={e.k === "ai" ? undefined : "noopener noreferrer"} className="block h-full">
                <SpotlightCard className={cn("flex h-full min-h-[340px] flex-col p-6 transition-transform duration-300 hover:-translate-y-1", e.featured && "border-accent/40 bg-[linear-gradient(160deg,rgba(216,255,74,0.14),transparent_55%)]")}>
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[13px] text-faint">{e.n}</span>
                      <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]", e.featured ? "border-accent/50 text-accent" : "border-line text-muted")}>{t(`home.ecosystem.${e.k}.tag`)}</span>
                    </div>
                    <h3 className="mt-auto pt-16 text-[28px] font-semibold leading-tight tracking-[-0.03em]">{t(`home.ecosystem.${e.k}.title`)}</h3>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{t(`home.ecosystem.${e.k}.body`)}</p>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent">
                      {t(`home.ecosystem.${e.k}.cta`)}
                      <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </SpotlightCard>
              </a>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-[20px] border border-line bg-paper p-6 md:p-8">
            <h3 className="text-[22px] font-semibold tracking-[-0.02em]">{t("home.ecosystem.rhythmTitle")}</h3>
            <div className="mt-6 grid gap-px overflow-hidden rounded-[14px] bg-line sm:grid-cols-3">
              {rhythm.map((b) => (
                <div key={b.cadence} className="bg-sunken p-5">
                  <p className="font-display text-[12px] uppercase tracking-[0.18em] text-accent">{b.cadence}</p>
                  <p className="mt-3 text-[16px] font-medium text-ink">{b.title}</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
          <a href={GET_INVOLVED} target="_blank" rel="noopener noreferrer" className="group flex flex-col justify-between rounded-[20px] border border-line bg-paper p-6 transition-colors hover:border-accent/40 md:p-8">
            <div>
              <h3 className="text-[22px] font-semibold tracking-[-0.02em]">{t("home.ecosystem.involveTitle")}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("home.ecosystem.involveBody")}</p>
            </div>
            <span className="mt-8 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent">
              {t("home.ecosystem.involveCta")}
              <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>
      </section>

      {/* 5 — Platform bento */}
      <section data-section="home.product" className="relative mx-auto max-w-[1240px] px-5 py-28 md:py-36">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-20 -z-10 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[120px]" />
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">{t("home.product.eyebrow")}</Eyebrow>
          <h2 className="mt-5 text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[64px]">{t("home.product.h2")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] text-muted">{t("home.product.lede")}</p>
        </div>

        <div className="mt-16 grid auto-rows-[minmax(0,auto)] gap-4 lg:grid-cols-6">
          <Reveal className="lg:col-span-4">
            <SpotlightCard className="h-full p-6 md:p-8">
              <BentoHead k="search" />
              <NlSearchDemo
                className="mt-6"
                prompt={t("home.split.agentPrompt")}
                chips={["HQ Country is any of Bolivia, Paraguay", "Sector is Financial Services", "Growth Stage is Pre-seed / Seed", "Headcount Growth (3m) ≥ 15%"]}
                result="Filters ready · edit, save or share"
              />
            </SpotlightCard>
          </Reveal>
          <Reveal index={1} className="lg:col-span-2 lg:row-span-2">
            <SpotlightCard className="h-full p-6 md:p-8">
              <BentoHead k="signals" />
              <p className="mt-4 font-display text-[14px] text-accent">{t("home.signals.stat", vars)}</p>
              <SignalTicker className="mt-5" items={ticker} />
            </SpotlightCard>
          </Reveal>
          <Reveal index={2} className="lg:col-span-2">
            <SpotlightCard className="flex h-full flex-col p-6 md:p-8">
              <LiveStat
                value={String(vars["stats.companies"] ?? "")}
                className={cn("font-display font-semibold leading-none tracking-[-0.04em] text-accent", isNumericStat(vars["stats.companies"]) ? "text-[56px] md:text-[72px]" : "text-[36px] first-letter:uppercase md:text-[44px]")}
              />
              <div className="mt-auto pt-8">
                <BentoHead k="data" vars={vars} />
              </div>
            </SpotlightCard>
          </Reveal>
          <Reveal index={3} className="lg:col-span-2">
            <SpotlightCard className="flex h-full flex-col p-6 md:p-8">
              <div aria-hidden className="relative mx-auto my-4 grid h-28 w-28 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full border border-accent/30 [animation-duration:3s]" />
                <span className="absolute inset-3 rounded-full border border-accent/30" />
                <span className="absolute inset-7 rounded-full border border-accent/50" />
                <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink shadow-[var(--shadow-glow)]">
                  <Bot size={22} />
                </span>
              </div>
              <div className="mt-auto">
                <BentoHead k="agent" />
              </div>
            </SpotlightCard>
          </Reveal>
          <Reveal index={4} className="lg:col-span-3">
            <SpotlightCard className="flex h-full flex-col p-6 md:p-8">
              <BentoHead k="mcp" icon={<Plug size={18} />} />
              <div aria-hidden className="mt-6 flex flex-wrap gap-2">
                {["Claude", "ChatGPT", "Cursor", "Windsurf", "OpenCode", "Claude Code"].map((c) => (
                  <span key={c} className="rounded-full border border-line-strong bg-white/[0.03] px-3.5 py-1.5 text-[13px] text-ink">
                    {c}
                  </span>
                ))}
              </div>
              <code className="mt-6 block overflow-x-auto rounded-[10px] border border-line bg-sunken px-4 py-3 font-mono text-[12.5px] text-accent">{appUrl("/mcp")}</code>
            </SpotlightCard>
          </Reveal>
          <Reveal index={5} className="lg:col-span-3">
            <SpotlightCard className="h-full p-6 md:p-8">
              <BentoHead k="api" icon={<Sparkles size={18} />} />
              <ApiTerminal className="mt-6" />
            </SpotlightCard>
          </Reveal>
        </div>

        <div className="mt-10 flex justify-center">
          <Link href="/platform" className={buttonClass("secondary", "lg", "group")}>
            {t("home.product.cta")}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* 6 — Live stats */}
      <section data-section="home.stats" className="border-y border-line bg-sunken">
        <div className="mx-auto max-w-[1240px] px-5 py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <h2 className="text-[34px] font-semibold tracking-[-0.03em] md:text-[48px]">{t("home.stats.h2")}</h2>
            <p className="inline-flex items-center gap-2 text-[13px] text-faint">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-positive" />
              {t("home.stats.eyebrow")}
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-line bg-line lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s} className="bg-canvas p-6 md:p-8">
                <LiveStat
                  value={String(vars[`stats.${s}`] ?? "")}
                  className={cn("block font-display font-semibold tracking-[-0.04em] text-ink", isNumericStat(vars[`stats.${s}`]) ? "text-[40px] md:text-[60px]" : "text-[24px] leading-tight first-letter:uppercase md:text-[30px]")}
                />
                <p className="mt-2 text-[14px] text-muted">{t(`home.stats.${s}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — Built in Santa Cruz */}
      <section data-section="home.latam" className="relative mx-auto max-w-[1240px] px-5 py-28 md:py-36">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>{t("home.latam.eyebrow")}</Eyebrow>
            <h2 className="mt-5 text-balance text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[60px]">{t("home.latam.h2")}</h2>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">{t("home.latam.body", vars)}</p>
            <div className="mt-8 flex flex-wrap gap-2">
              {tList("home.latam.countries").map((c, i) => (
                <span key={c} className={cn("rounded-full border px-3.5 py-1.5 text-[13px]", i === 0 ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-text")}>
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[460px]">
            {[0, 1, 2, 3].map((r) => (
              <span key={r} className="radar-ring absolute inset-0 rounded-full border border-accent/30" style={{ animationDelay: `${r * 1.1}s` }} />
            ))}
            <div className="absolute inset-[18%] rounded-full border border-line" />
            <div className="absolute inset-[34%] rounded-full border border-line" />
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(216,255,74,0.22),transparent_25%)] [animation:spin_6s_linear_infinite] motion-reduce:hidden" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-3">
                <span className="relative flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-accent" />
                </span>
                <span className="font-display text-[40px] font-semibold tracking-[-0.03em] text-ink">SCZ</span>
                <span className="font-mono text-[12px] text-faint">{t("home.latam.coords")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8 — Instagram */}
      <section data-section="home.social" className="mx-auto max-w-[1240px] px-5 py-24 md:py-32">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <Eyebrow>{t("home.social.eyebrow")}</Eyebrow>
            <h2 className="mt-5 text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[64px]">{t("home.social.h2")}</h2>
            <p className="mt-4 text-[17px] text-muted">{t("home.social.lede")}</p>
          </div>
          <a href={brand.social.instagram} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg", "group")}>
            {t("home.social.cta")}
            <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p, i) => (
            <Reveal key={p.url} index={i}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className={cn("group flex aspect-[4/3] flex-col justify-between rounded-[20px] border p-6 transition-all duration-300 hover:-translate-y-1", i % 3 === 0 ? "border-accent/40 bg-accent text-accent-ink" : "border-line bg-paper hover:border-accent/40")}>
                <span className={cn("font-display text-[12px] uppercase tracking-[0.18em]", i % 3 === 0 ? "text-accent-ink/70" : "text-faint")}>{p.date}</span>
                <p className={cn("text-balance font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] md:text-[24px]", i % 3 === 0 ? "text-accent-ink" : "text-ink")}>{p.text}</p>
                <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", i % 3 === 0 ? "text-accent-ink" : "text-accent")}>
                  {t("home.social.view")}
                  <ArrowUpRight size={14} />
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 9 — Closing */}
      <section data-section="home.closing" data-closing-cta className="mx-auto max-w-[1240px] px-5 pb-10 pt-10">
        <div className="relative overflow-hidden rounded-[32px] border border-line-strong bg-paper px-6 py-20 text-center md:px-16 md:py-28">
          <div aria-hidden className="hero-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(216,255,74,0.22),transparent_60%)]" />
          <div className="relative flex flex-col items-center">
            <h2 className="text-balance font-display text-[48px] font-semibold leading-[0.95] tracking-[-0.045em] md:text-[104px]">
              <span className="block">{t("home.closing2.h2a")}</span>
              <span className="hero-shine block bg-clip-text text-transparent">{t("home.closing2.h2b")}</span>
            </h2>
            <p className="mt-7 max-w-2xl text-[17px] text-muted md:text-[19px]">{t("home.closing2.body")}</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a href={appUrl("/signup")} className={buttonClass("primary", "lg", "group h-14 px-8 text-[16px] shadow-[0_0_40px_rgba(216,255,74,0.35)]")}>
                {t("home.closing2.cta")}
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </a>
              <a href={brand.urls.academy} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg", "h-14 px-8 text-[16px]")}>
                {t("home.closing2.secondary")}
              </a>
            </div>
            <p className="mt-8 text-[12px] text-faint">{t("global.demoData")}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function BentoHead({ k, vars, icon }: { k: string; vars?: Record<string, string | number>; icon?: ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em]">
        {icon ? <span className="text-accent">{icon}</span> : null}
        {t(`home.product.${k}.title`)}
      </h3>
      <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-muted">{t(`home.product.${k}.body`, vars)}</p>
    </div>
  );
}
