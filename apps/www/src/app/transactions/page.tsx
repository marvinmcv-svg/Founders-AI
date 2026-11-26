import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Card } from "@founders/ui";
import { Reveal } from "@founders/ui/motion";
import { FIX, RoundsMock } from "@founders/mocks";
import { ApiPromo, ClosingCta, FourCards, Header2, LogoWall, PageHero, Section } from "@/components/sections";
import { t, tList } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: "Transactions", description: "Funding rounds, acquisitions and IPOs with every investor attached." };

export default async function Transactions() {
  const vars = await getStatVars();
  const r = FIX.rounds[0] ?? {};
  return (
    <>
      <PageHero id="transactions.hero" eyebrow={t("transactions.hero.eyebrow")} h1={t("transactions.hero.h1")} sub={t("transactions.hero.sub", vars)}>
        <Reveal>
          <RoundsMock />
        </Reveal>
      </PageHero>
      <LogoWall id="transactions.logos" />
      <Section id="transactions.overview">
        <Header2 prefix="transactions.overview" />
        <div className="mt-10">
          <FourCards prefix="transactions.overview" />
        </div>
      </Section>
      <Section id="transactions.carries">
        <Header2 prefix="transactions.carries" />
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {tList("transactions.carries.items").map((x) => (
            <Card key={x} className="flex items-center gap-3 p-4 text-[15px] text-text">
              <Check size={16} className="text-accent" />
              {x}
            </Card>
          ))}
        </div>
      </Section>
      <ApiPromo
        id="transactions.api"
        title="Deal feeds, programmatically."
        lede="Poll rounds, acquisitions and IPOs with date filters and cursor pagination."
        endpoints={[
          ["GET", "/funding-rounds?announced_date_after=2026-01-01"],
          ["GET", "/funding-rounds/{roundId}"],
          ["GET", "/acquisitions"],
          ["GET", "/ipos"],
          ["GET", "/companies/{companyId}/funding-rounds"],
        ]}
        samplePath="/funding-rounds?limit=1"
        sampleJson={JSON.stringify({ items: [{ id: r.id, company_id: r.company_id, company_name: r.company_name, type: r.type, amount_usd: r.amount_usd, announced_date: r.announced_date, investors: r.investors }], next_cursor: "eyJvIjoxfQ" }, null, 2)}
      />
      <ClosingCta id="transactions.closing" vars={vars} />
    </>
  );
}
