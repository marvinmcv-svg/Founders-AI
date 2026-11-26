import type { Metadata } from "next";
import { Card, Chip, Favicon } from "@founders/ui";
import { Reveal } from "@founders/ui/motion";
import { FIX, InvestorDbMock } from "@founders/mocks";
import { ApiPromo, ClosingCta, FourCards, Header2, LogoWall, PageHero, Section } from "@/components/sections";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: "Investors", description: "Funds, angels and CVCs with stages, check sizes, portfolios and co-investors." };

export default async function Investors() {
  const vars = await getStatVars();
  const inv = FIX.investors[0] ?? {};
  return (
    <>
      <PageHero id="investors.hero" eyebrow={t("investors.hero.eyebrow")} h1={t("investors.hero.h1")} sub={t("investors.hero.sub", vars)}>
        <Reveal>
          <InvestorDbMock />
        </Reveal>
      </PageHero>
      <LogoWall id="investors.logos" />
      <Section id="investors.overview">
        <Header2 prefix="investors.overview" />
        <div className="mt-10">
          <FourCards prefix="investors.overview" />
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {["Fund details", "Check sizes", "Lead investments", "Portfolio breakdown", "Exit patterns", "Follow-on rate", "Target stages", "Geographies", "AUM", "Unicorn count"].map((x) => (
            <Chip key={x}>{x}</Chip>
          ))}
        </div>
      </Section>
      <Section id="investors.backers">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
          <Header2 prefix="investors.backers" />
          <Reveal>
            <Card>
              <div className="border-b border-line px-4 py-3 text-[12px] text-muted">Most relevant backers · {String(FIX.profile.company.name)}</div>
              {FIX.investors.slice(0, 6).map((x, i) => (
                <div key={String(x.id)} className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 text-[13px]" aria-hidden>
                  <Favicon name={String(x.name)} />
                  <span className="flex-1 truncate text-ink">{String(x.name)}</span>
                  <span className="text-muted">{String(x.type)}</span>
                  <span className="w-10 text-right font-display text-accent">{96 - i * 3}</span>
                </div>
              ))}
            </Card>
          </Reveal>
        </div>
      </Section>
      <ApiPromo
        id="investors.api"
        title="Investor data, programmatically."
        lede="Look up any investor, their portfolio, rounds and co-investors."
        endpoints={[
          ["POST", "/investors/resolve"],
          ["GET", "/investors/{investorId}"],
          ["GET", "/investors/{investorId}/portfolio"],
          ["GET", "/investors/{investorId}/funding-rounds"],
          ["GET", "/investors/{investorId}/co-investors"],
        ]}
        samplePath={`/investors/${String(inv.id)}`}
        sampleJson={JSON.stringify({ id: inv.id, name: inv.name, type: inv.type, hq_country: inv.hq_country, target_stages: inv.target_stages, investments_count: inv.investments_count, exits_count: inv.exits_count, follow_on_rate: inv.follow_on_rate }, null, 2)}
      />
      <ClosingCta id="investors.closing" vars={vars} />
    </>
  );
}
