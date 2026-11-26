import type { Metadata } from "next";
import { Gauge, Layers, ReceiptText, Rows3 } from "lucide-react";
import { brand } from "@founders/config";
import { FIX } from "@founders/mocks";
import { CodeBlock } from "@founders/ui/code";
import { Block, CardGrid, CtaBand, ProductHero, StatTiles } from "@/components/sections/kit";
import { ApiExplorer, type ApiSample } from "@/components/mocks/ai-client";
import { t } from "@/lib/copy";
import { appUrl } from "@/lib/nav";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export async function generateMetadata(): Promise<Metadata> {
  const vars = await getStatVars();
  return { title: t("apiPage.meta.title"), description: t("apiPage.meta.description", vars), alternates: { canonical: "/api" } };
}

const j = (v: unknown) => JSON.stringify(v, null, 2);

function samples(): ApiSample[] {
  const c = FIX.profile.company;
  const p = FIX.people[0] ?? {};
  const est = FIX.profile.estimates;
  const last = est[est.length - 1] ?? {};
  const L = (k: string) => t(`apiPage.explorer.samples.${k}`);
  return [
    { id: "company", label: L("company"), method: "GET", path: `/companies/${String(c.id)}`, json: j({ id: c.id, name: c.name, domain: c.domain, growth_stage: c.growth_stage, hq: { city: c.hq_city, country: c.hq_country }, employee_count: c.employee_count, headcount_growth_3m: c.headcount_growth_3m, total_funding_usd: c.total_funding_usd, last_funding_type: c.last_funding_type, highlights: c.highlights }) },
    { id: "resolve", label: L("resolve"), method: "POST", path: "/companies/resolve", json: j({ data: [{ input: { domain: c.domain }, company_id: c.id, confidence: 0.98 }], credits_charged: 0 }) },
    { id: "person", label: L("person"), method: "GET", path: `/people/${String(p.id)}`, json: j({ id: p.id, full_name: p.full_name, current_title: p.current_title, current_company_name: p.current_company_name, location: p.location, highlights: p.highlights, talent_signal_count: p.talent_signal_count }) },
    { id: "talent", label: L("talent"), method: "GET", path: "/talent?min_score=8", json: j({ data: FIX.talent.slice(0, 2), next_cursor: "c_2" }) },
    { id: "revenue", label: L("revenue"), method: "GET", path: `/companies/${String(c.id)}/latest-revenue`, json: j({ company_id: c.id, est_revenue_usd: last.revenue_p50, est_revenue_p10_usd: last.revenue_p10, est_revenue_p90_usd: last.revenue_p90, revenue_type: last.revenue_type, confidence: last.confidence, as_of: last.month }) },
    { id: "competitors", label: L("competitors"), method: "GET", path: `/companies/${String(c.id)}/competitors`, json: j({ data: FIX.profile.competitors.slice(0, 3).map((x) => ({ id: x.id, name: x.name, hq_country: x.hq_country, overlap_score: x.overlap_score, reason: x.reason })) }) },
    { id: "search", label: L("search"), method: "POST", path: "/search", json: j({ query_id: "qry_demo", filters: [{ field: "hq_country", op: "in", value: ["Bolivia", "Paraguay"] }, { field: "growth_stage", op: "in", value: ["Pre-seed / Seed"] }], total: 42 }) },
    { id: "saved", label: L("saved"), method: "GET", path: "/searches/companies/srch_demo/results?new_only=true", json: j({ data: FIX.companies.slice(0, 2).map((x) => ({ id: x.id, name: x.name, hq_country: x.hq_country, is_new: true })), next_cursor: null }) },
  ];
}

export default async function ApiPage() {
  const vars = await getStatVars();
  return (
    <>
      <ProductHero id="api.hero" prefix="apiPage.hero" vars={vars} secondary={{ label: t("apiPage.hero.docs"), href: appUrl("/developers") }}>
        <CodeBlock
          title={<span className="font-mono text-[12px] text-muted">POST /companies/resolve</span>}
          tabs={[{ label: "cURL", code: `curl -X POST -H "X-API-Key: $FOUNDERS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  "${brand.urls.app}/api/v1/companies/resolve" \\\n  -d '{"items":[{"domain":"${String(FIX.profile.company.domain)}"}]}'`, lang: "bash" }]}
        />
      </ProductHero>
      <Block id="api.coverage" prefix="apiPage.coverage" vars={vars}>
        <StatTiles items={(["companies", "people", "investors", "transactions"] as const).map((k) => ({ value: String(vars[`stats.${k}`] ?? ""), label: t(`apiPage.coverage.${k}`) }))} />
      </Block>
      <Block id="api.endpoints" prefix="apiPage.endpoints" vars={vars}>
        <CardGrid prefix="apiPage.endpoints" vars={vars} icons={[<ReceiptText key="a" size={16} />, <Layers key="b" size={16} />, <Gauge key="c" size={16} />, <Rows3 key="d" size={16} />]} />
      </Block>
      <Block id="api.explorer" prefix="apiPage.explorer" vars={vars}>
        <ApiExplorer samples={samples()} base={brand.urls.app} />
      </Block>
      <Block id="api.capabilities" prefix="apiPage.capabilities" vars={vars}>
        <CardGrid prefix="apiPage.capabilities" vars={vars} />
      </Block>
      <Block id="api.start" prefix="apiPage.start" vars={vars}>
        <CardGrid prefix="apiPage.start" vars={vars} cols={3} />
      </Block>
      <CtaBand id="api.closing" h2={t("apiPage.closing.h2")} body={t("apiPage.closing.body")} />
    </>
  );
}
