import type { Metadata } from "next";
import { Bot, Layers, ListChecks, Newspaper } from "lucide-react";
import { FIX } from "@founders/mocks";
import { ApiPromo } from "@/components/sections";
import { Block, CardGrid, CtaBand, ProductHero, Split } from "@/components/sections/kit";
import { CompetitorNewsMock, NewsCardsMock } from "@/components/mocks/signals";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: t("news.meta.title"), description: t("news.meta.description"), alternates: { canonical: "/news" } };

export default async function News() {
  const vars = await getStatVars();
  const c = FIX.companies[0] ?? {};
  const sample = {
    data: [
      {
        id: "nsg_demo_01",
        company_id: c.id,
        company_name: c.name,
        category: "FUNDING",
        score: 5,
        is_major: true,
        summary: `${String(c.name)} closed a new round led by a regional fund.`,
        published_at: "2026-11-25T14:02:00Z",
        source: { name: "Demo Wire", url: "https://example.com/news/demo-01" },
      },
    ],
    next_cursor: null,
  };
  return (
    <>
      <ProductHero id="news.hero" prefix="news.hero" vars={vars}>
        <div className="p-4">
          <NewsCardsMock />
        </div>
      </ProductHero>
      <Block id="news.signals" prefix="news.signals" vars={vars}>
        <CardGrid prefix="news.signals" vars={vars} icons={[<Layers key="a" size={16} />, <Newspaper key="b" size={16} />, <ListChecks key="c" size={16} />, <Bot key="d" size={16} />]} />
      </Block>
      <Block id="news.updates" prefix="news.updates" vars={vars} center>
        <CardGrid prefix="news.updates" vars={vars} cols={3} />
      </Block>
      <Split id="news.lists" prefix="news.lists" vars={vars} bullets>
        <NewsCardsMock count={4} className="lg:grid-cols-2" />
      </Split>
      <Split id="news.competitive" prefix="news.competitive" vars={vars} reverse>
        <CompetitorNewsMock />
      </Split>
      <ApiPromo
        id="news.api"
        title={t("news.api.h2")}
        lede={t("news.api.lede")}
        endpoints={[
          ["GET", "/companies/{companyId}/news-signals"],
          ["GET", "/news-signals"],
          ["POST", "/companies/resolve"],
          ["GET", "/companies/{companyId}/competitors"],
          ["GET", "/lists/companies/{listId}/results"],
        ]}
        samplePath={`/companies/${String(c.id)}/news-signals`}
        sampleJson={JSON.stringify(sample, null, 2)}
      />
      <Block id="news.agents" prefix="news.agents" vars={vars} center />
      <CtaBand id="news.closing" h2={t("news.closing.h2")} body={t("news.closing.body")} />
    </>
  );
}
