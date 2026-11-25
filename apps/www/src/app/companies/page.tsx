import type { Metadata } from "next";
import { Reveal } from "@founders/ui/motion";
import { CompaniesDbMock, CompanyProfileMock, CompetitorsMock, FIX } from "@founders/mocks";
import { ApiPromo, ClosingCta, FourCards, Header2, LogoWall, PageHero, Section, TestimonialsPlaceholder } from "@/components/sections";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Companies", description: "A private company database with funding, growth and modeled revenue for every company." };

export default async function Companies() {
  const vars = await getStatVars();
  const c = FIX.profile.company;
  const sample = JSON.stringify(
    {
      id: c.id,
      organization_name: c.name,
      organization_rank: c.rank,
      growth_stage: c.growth_stage,
      hq: { city: c.hq_city, country: c.hq_country },
      employee_count: c.employee_count,
      funding: { total_funding_usd: c.total_funding_usd, last_funding_type: c.last_funding_type, last_funding_date: c.last_funding_date },
      revenue_estimate_usd: c.est_revenue_usd,
      highlights: c.highlights,
    },
    null,
    2,
  );
  return (
    <>
      <PageHero id="companies.hero" eyebrow={t("companies.hero.eyebrow")} h1={t("companies.hero.h1")} sub={t("companies.hero.sub", vars)}>
        <Reveal>
          <CompaniesDbMock count={String(vars["stats.companies"] ?? "")} />
        </Reveal>
      </PageHero>
      <LogoWall id="companies.logos" />
      <Section id="companies.overview">
        <Header2 prefix="companies.overview" />
        <div className="mt-10">
          <FourCards prefix="companies.overview" vars={vars} />
        </div>
      </Section>
      <Section id="companies.profile" anchor="estimates">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.3fr]">
          <Header2 prefix="companies.profile" />
          <Reveal>
            <CompanyProfileMock />
          </Reveal>
        </div>
      </Section>
      <Section id="companies.competitors">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
          <Header2 prefix="companies.competitors" />
          <Reveal>
            <CompetitorsMock />
          </Reveal>
        </div>
      </Section>
      <ApiPromo
        id="companies.api"
        title={t("companies.api.h2")}
        lede={t("companies.api.lede")}
        endpoints={[
          ["POST", "/companies/resolve"],
          ["GET", "/companies/{companyId}"],
          ["GET", "/companies/{companyId}/competitors"],
          ["GET", "/companies/{companyId}/funding-rounds"],
          ["GET", "/companies/{companyId}/latest-revenue"],
        ]}
        samplePath={`/companies/${String(c.id)}`}
        sampleJson={sample}
      />
      <TestimonialsPlaceholder id="companies.testimonials" />
      <ClosingCta id="companies.closing" vars={vars} />
    </>
  );
}
