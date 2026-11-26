import type { Metadata } from "next";
import Link from "next/link";
import { Cable, Globe, Network, RefreshCw } from "lucide-react";
import { brand } from "@founders/config";
import { FIX } from "@founders/mocks";
import { Marquee } from "@founders/ui/motion";
import { Card } from "@founders/ui";
import { Block, CardGrid, CtaBand, ProductHero, Split } from "@/components/sections/kit";
import { ApiExplorer, type ApiSample } from "@/components/mocks/ai-client";
import { BrowserCardMock, CrmSyncMock, IntegrationTiles, NetworkMock } from "@/components/mocks/integrations";
import { IntegrationDirectory } from "@/components/mocks/IntegrationDirectory";
import { pageMeta } from "@/lib/meta";
import { t, tList } from "@/lib/copy";
import { appUrl } from "@/lib/nav";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export async function generateMetadata(): Promise<Metadata> {
  const vars = await getStatVars();
  return pageMeta({ title: t("integrationsPage.meta.title"), description: t("integrationsPage.meta.description", vars), path: "/integrations", kicker: t("integrationsPage.hero.eyebrow"), ogTitle: `${t("integrationsPage.hero.h1")} ${t("integrationsPage.hero.h1Accent")}` });
}

const j = (v: unknown) => JSON.stringify(v, null, 2);

/** Five highlighted endpoints (plan 6.14 #7), fixture responses. */
function samples(): ApiSample[] {
  const c = FIX.profile.company;
  const p = FIX.people[0] ?? {};
  const L = (k: string) => t(`integrationsPage.api.samples.${k}`);
  return [
    { id: "search", label: L("search"), method: "POST", path: "/search", json: j({ query_id: "qry_demo", product: "companies", total: FIX.companies.length, items: FIX.companies.slice(0, 2).map((x) => ({ id: x.id, name: x.name })) }) },
    { id: "resolve", label: L("resolve"), method: "POST", path: "/companies/resolve", json: j({ items: [{ input: { domain: c.domain }, company_id: c.id }], credits_charged: 0 }) },
    { id: "person", label: L("person"), method: "POST", path: "/people", json: j({ items: [{ input: { email: "founder@example.com" }, match: { id: p.id, full_name: p.full_name, current_title: p.current_title } }], matched: 1 }) },
    { id: "feed", label: L("feed"), method: "GET", path: "/searches/companies/srh_demo/results?new_since_last_read=true", json: j({ items: FIX.companies.slice(0, 2).map((x) => ({ id: x.id, name: x.name, hq_country: x.hq_country })), next_cursor: null }) },
    { id: "network", label: L("network"), method: "GET", path: "/network/companies", json: j({ items: FIX.companies.slice(0, 2).map((x, i) => ({ company_id: x.id, name: x.name, people: 3 - i, teammates: 2 - i })), next_cursor: null }) },
  ];
}

export default async function Integrations() {
  const vars = await getStatVars();
  const D = (k: string) => t(`integrationsPage.directory.${k}`);
  const tabs = (["crm", "network", "ai", "warehouse", "dev"] as const).map((id) => ({ id, label: D(`tabs.${id}`), items: tList(`integrationsPage.directory.items.${id}`) }));
  return (
    <>
      <ProductHero id="integrations.hero" prefix="integrationsPage.hero" vars={vars} secondary={{ label: t("integrationsPage.hero.cta"), href: appUrl("/settings#crm") }}>
        <IntegrationTiles />
      </ProductHero>
      <Block id="integrations.delivery" prefix="integrationsPage.delivery" vars={vars}>
        <Marquee speed={30} className="mb-8">
          {tList("integrationsPage.delivery.ticker", vars).map((x) => (
            <span key={x} className="flex items-center gap-3 whitespace-nowrap pr-4 font-display text-[22px] text-ink">
              {x} <span className="text-accent">✳</span>
            </span>
          ))}
        </Marquee>
        <CardGrid prefix="integrationsPage.delivery" vars={vars} icons={[<RefreshCw key="a" size={16} />, <Network key="b" size={16} />, <Cable key="c" size={16} />, <Globe key="d" size={16} />]} />
      </Block>
      <Block id="integrations.directory" prefix="integrationsPage.directory" vars={vars}>
        <IntegrationDirectory tabs={tabs} ask={D("ask")} />
      </Block>
      <Split id="integrations.crm" anchor="crm" prefix="integrationsPage.crm" vars={vars} bullets>
        <CrmSyncMock />
      </Split>
      <Split id="integrations.network" anchor="network" prefix="integrationsPage.network" vars={vars} bullets reverse>
        <NetworkMock />
      </Split>
      <Split id="integrations.chrome" anchor="chrome" prefix="integrationsPage.chrome" vars={vars} bullets>
        <div className="flex flex-col gap-4">
          <BrowserCardMock />
          <BrowserCardMock linkedin />
        </div>
      </Split>
      <Block id="integrations.api" anchor="api" prefix="integrationsPage.api" vars={vars}>
        <ApiExplorer samples={samples()} base={brand.urls.app} />
        <Card className="mt-6 flex flex-col gap-2 p-5 md:flex-row md:items-center md:gap-6">
          <b className="text-[16px] text-ink">{t("integrationsPage.api.bulk.title")}</b>
          <span className="text-[14px] text-muted">{t("integrationsPage.api.bulk.body")}</span>
          <span className="flex gap-2 md:ml-auto">
            {["Amazon S3", "Google Cloud", "Snowflake"].map((x) => (
              <span key={x} className="rounded-full border border-line px-3 py-1 text-[12px] text-text">
                {x}
              </span>
            ))}
          </span>
        </Card>
      </Block>
      <Block id="integrations.mcp" prefix="integrationsPage.mcp" vars={vars}>
        <Link href="/mcp" className="text-[15px] text-accent hover:underline">
          {t("integrationsPage.mcp.link")} →
        </Link>
      </Block>
      <CtaBand id="integrations.closing" h2={t("integrationsPage.closing.h2")} body={t("integrationsPage.closing.body")} />
    </>
  );
}
