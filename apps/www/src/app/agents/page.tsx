import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Globe, SlidersHorizontal, Sparkles } from "lucide-react";
import { buttonClass } from "@founders/ui";
import { Rotator } from "@founders/ui/motion";
import { Block, CardGrid, CtaBand, Kicker, ProductHero, Split } from "@/components/sections/kit";
import { AgentMock, SkillLibraryMock } from "@/components/mocks/ai";
import { pageMeta } from "@/lib/meta";
import { t, tList } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = pageMeta({ title: t("agents.meta.title"), description: t("agents.meta.description"), path: "/agents", kicker: t("agents.hero.eyebrow"), ogTitle: `${t("agents.hero.h1")} ${t("agents.hero.h1Accent")}` });

export default async function Agents() {
  const vars = await getStatVars();
  return (
    <>
      <ProductHero id="agents.hero" prefix="agents.hero" vars={vars}>
        <div className="flex items-center gap-3 px-3 pb-3 pt-2 text-[13px] text-muted">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
          <Rotator words={tList("agents.hero.rotator")} className="font-display text-[15px] text-ink" />
        </div>
        <AgentMock />
      </ProductHero>
      <Block id="agents.pillars" prefix="agents.pillars" vars={vars}>
        <CardGrid prefix="agents.pillars" vars={vars} icons={[<BookOpen key="a" size={16} />, <SlidersHorizontal key="b" size={16} />, <Sparkles key="c" size={16} />, <Globe key="d" size={16} />]} />
      </Block>
      <Block id="agents.datasets" prefix="agents.datasets" vars={vars} center>
        <CardGrid prefix="agents.datasets" vars={vars} cols={3} />
      </Block>
      <Split id="agents.skills" prefix="agents.skills" vars={vars} bullets>
        <SkillLibraryMock />
      </Split>
      <Block id="agents.context" prefix="agents.context" vars={vars}>
        <CardGrid prefix="agents.context" vars={vars} cols={3} />
      </Block>
      <section data-section="agents.mcp" className="mx-auto max-w-[1240px] px-5 py-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[24px] border border-line bg-paper p-8 md:flex-row md:items-center md:p-12">
          <div className="max-w-2xl">
            <Kicker>{t("agents.mcp.eyebrow")}</Kicker>
            <h2 className="mt-4 text-[30px] font-semibold leading-tight tracking-[-0.03em] md:text-[40px]">{t("agents.mcp.h2")}</h2>
            <p className="mt-3 text-[16px] text-muted">{t("agents.mcp.lede", vars)}</p>
          </div>
          <Link href="/mcp" className={buttonClass("secondary", "lg")}>
            {t("agents.mcp.cta")}
          </Link>
        </div>
      </section>
      <CtaBand id="agents.closing" h2={t("agents.closing.h2")} body={t("agents.closing.body")} />
    </>
  );
}
