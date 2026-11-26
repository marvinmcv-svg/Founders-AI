import type { Metadata } from "next";
import { Anchor, Gauge, Layers, TrendingUp } from "lucide-react";
import { CompanyProfileMock, FIX } from "@founders/mocks";
import { CodeBlock } from "@founders/ui/code";
import { Block, CardGrid, CtaBand, ProductHero, Split } from "@/components/sections/kit";
import { AnchoredBandMock, DriversMock, ValuationMock } from "@/components/mocks/signals";
import { pageMeta } from "@/lib/meta";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = pageMeta({ title: t("revenue.meta.title"), description: t("revenue.meta.description"), path: "/revenue-valuation", kicker: t("revenue.hero.eyebrow"), ogTitle: `${t("revenue.hero.h1")} ${t("revenue.hero.h1Accent")}` });

export default async function RevenueValuation() {
  const vars = await getStatVars();
  const c = FIX.profile.company;
  const est = FIX.profile.estimates;
  const last = est[est.length - 1] ?? {};
  const prev = est[est.length - 4] ?? {};
  const sample = {
    company_id: c.id,
    est_revenue_usd: last.revenue_p50,
    est_revenue_p10_usd: last.revenue_p10,
    est_revenue_p90_usd: last.revenue_p90,
    revenue_type: last.revenue_type,
    confidence: last.confidence,
    latest_revenue_reported_usd: null,
    est_revenue_growth_3m_pct: Math.round((Number(last.revenue_p50) / Number(prev.revenue_p50) - 1) * 1000) / 10,
    as_of: last.month,
    model_version: last.model_version,
  };
  return (
    <>
      <ProductHero id="revenue.hero" prefix="revenue.hero" vars={vars}>
        <CompanyProfileMock />
      </ProductHero>
      <Block id="revenue.pillars" prefix="revenue.pillars" vars={vars}>
        <CardGrid prefix="revenue.pillars" vars={vars} icons={[<Anchor key="a" size={16} />, <TrendingUp key="b" size={16} />, <Gauge key="c" size={16} />, <Layers key="d" size={16} />]} />
      </Block>
      <Block id="revenue.coverage" prefix="revenue.coverage" vars={vars}>
        <CardGrid prefix="revenue.coverage" vars={vars} cols={3} />
      </Block>
      <Split id="revenue.anchored" prefix="revenue.anchored" vars={vars}>
        <AnchoredBandMock />
      </Split>
      <Split id="revenue.valuation" anchor="valuation-estimates" prefix="revenue.valuation" vars={vars} reverse>
        <ValuationMock />
      </Split>
      <Block id="revenue.model" prefix="revenue.model" vars={vars}>
        <DriversMock />
      </Block>
      <Split id="revenue.delivery" prefix="revenue.delivery" vars={vars} bullets>
        <CodeBlock title={`GET /companies/${String(c.id)}/latest-revenue`} tabs={[{ label: "Response", code: JSON.stringify(sample, null, 2), lang: "json" }]} />
      </Split>
      <CtaBand id="revenue.closing" h2={t("revenue.closing.h2")} body={t("revenue.closing.body")} />
    </>
  );
}
