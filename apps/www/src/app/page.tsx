import Link from "next/link";
import { buttonClass, Card, FeatureCard, SectionHeader } from "@founders/ui";
import { Reveal } from "@founders/ui/motion";
import { CompaniesDbMock, FIX, PeopleDbMock, SavedSearchesMock, TalentMock, TrendingCard } from "@founders/mocks";
import { ApiTerminal, NlSearchDemo, SignalTicker } from "@founders/mocks/animated";
import { taxonomyName } from "@founders/core/taxonomy";
import { ClosingCta, FourCards, Header2, LogoWall, PageHero, Section, TestimonialsPlaceholder } from "@/components/sections";
import { PillarNav } from "@/components/sections/PillarNav";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;

export default async function Home() {
  const vars = await getStatVars();
  const ticker = FIX.talent.map((s, i) => ({
    title: String(s.person_name),
    body: String(s.summary),
    category: String(s.type).replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    time: ["now", "4 min", "22 min", "1 hr", "2 hr", "3 hr"][i % 6] ?? "today",
  }));
  const top = FIX.growth[0] ?? {};
  return (
    <>
      <PageHero id="home.hero" eyebrow={t("home.hero.eyebrow")} h1={t("home.hero.h1")} sub={t("home.hero.sub", vars)}>
        <Reveal>
          <CompaniesDbMock count={String(vars["stats.companies"] ?? "")} />
        </Reveal>
      </PageHero>

      <LogoWall id="home.logos" />

      <Section id="home.split" className="pt-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col gap-5 p-6">
            <div>
              <h3 className="text-[22px] font-semibold">{t("home.split.agentTitle")}</h3>
              <p className="mt-1 text-[14px] text-muted">{t("home.split.agentBody")}</p>
            </div>
            <NlSearchDemo
              prompt={t("home.split.agentPrompt")}
              chips={["HQ Country is any of Bolivia, Paraguay", "Sector is Financial Services", "Growth Stage is Pre-seed / Seed", "Headcount Growth (3m) ≥ 15%"]}
              result="Filters ready · edit, save or share"
            />
          </Card>
          <Card className="flex flex-col gap-5 p-6">
            <div>
              <h3 className="text-[22px] font-semibold">{t("home.split.apiTitle")}</h3>
              <p className="mt-1 text-[14px] text-muted">{t("home.split.apiBody")}</p>
            </div>
            <ApiTerminal />
            <a href={`${process.env.NEXT_PUBLIC_APP_URL}/developers`} className={buttonClass("link")}>
              {t("home.split.apiCta")} →
            </a>
          </Card>
        </div>
      </Section>

      <Section id="home.problem" className="text-center">
        <Header2 prefix="home.problem" align="center" />
        <p className="mx-auto mt-6 max-w-3xl text-[17px] leading-relaxed text-muted">{t("home.problem.body")}</p>
      </Section>

      <PillarNav
        items={[
          { id: "data", label: t("home.pillars.data") },
          { id: "signals", label: t("home.pillars.signals") },
          { id: "sourcing", label: t("home.pillars.sourcing") },
          { id: "monitor", label: t("home.pillars.monitor") },
        ]}
      />

      <Section id="home.data" anchor="data">
        <Header2 prefix="home.data" vars={vars} />
        <Reveal className="mt-10">
          <PeopleDbMock />
        </Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {["companies", "people", "investors", "transactions"].map((k, i) => (
            <Reveal key={k} index={i}>
              <Link href={`/${k}`} className="block h-full">
                <FeatureCard className="h-full transition-colors hover:border-accent/40" title={t(`home.data.${k}.title`)} body={t(`home.data.${k}.body`, vars)} link={<span className="text-[13px] text-accent">{t("global.cta.explore")} →</span>} />
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="home.signals" anchor="signals">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-6">
            <Header2 prefix="home.signals" vars={vars} />
            <p className="font-display text-[15px] text-accent">{t("home.signals.stat", vars)}</p>
            <SignalTicker items={ticker} />
          </div>
          <Reveal>
            <TalentMock />
          </Reveal>
        </div>
      </Section>

      <Section id="home.sourcing" anchor="sourcing">
        <Header2 prefix="home.sourcing" />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {["c1", "c2", "c3"].map((k, i) => (
            <Reveal key={k} index={i}>
              <FeatureCard className="h-full" title={t(`home.sourcing.${k}.title`)} body={t(`home.sourcing.${k}.body`)} />
            </Reveal>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {FIX.companies.slice(0, 6).flatMap((c) => (Array.isArray(c.tech_vertical_ids) ? (c.tech_vertical_ids as string[]).slice(0, 1) : [])).map((v, i) => (
            <span key={`${v}${i}`} className="rounded-full border border-line px-3 py-1 text-[12px] text-muted">
              {taxonomyName(v)}
            </span>
          ))}
        </div>
      </Section>

      <Section id="home.monitor" anchor="monitor">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.3fr]">
          <Header2 prefix="home.monitor" />
          <div className="relative">
            <SavedSearchesMock />
            <TrendingCard
              className="absolute -bottom-6 left-4 w-[300px] bg-raised shadow-[var(--shadow-window)] md:-left-8"
              text={t("home.monitor.trending", { company: String(top.name ?? ""), pct: `${Math.round(Number(top.headcount_growth_3m ?? 0) * 100)}%` })}
            />
          </div>
        </div>
      </Section>

      <TestimonialsPlaceholder id="home.testimonials" />

      <Section id="home.workflow">
        <Header2 prefix="home.workflow" action={<Link href="/soon/integrations" className={buttonClass("secondary")}>{t("home.workflow.cta")}</Link>} />
      </Section>

      <Section id="home.latam">
        <Card className="grid gap-8 p-8 md:grid-cols-[1fr_1fr] md:p-12">
          <SectionHeader eyebrow={t("home.latam.eyebrow")} title={t("home.latam.h2")} />
          <p className="self-end text-[16px] leading-relaxed text-muted">{t("home.latam.body", vars)}</p>
        </Card>
        <div className="mt-8">
          <FourCards prefix="companies.overview" vars={vars} />
        </div>
      </Section>

      <ClosingCta id="home.closing" vars={vars} />
    </>
  );
}
