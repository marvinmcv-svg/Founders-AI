import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Card, FeatureCard, SectionHeader, StackBar } from "@founders/ui";
import { Reveal } from "@founders/ui/motion";
import { CompaniesDbMock, CompanyProfileMock, FIX, SavedSearchesMock } from "@founders/mocks";
import { NlSearchDemo } from "@founders/mocks/animated";
import { ClosingCta, Header2, LogoWall, PageHero, Section, StatStrip, TestimonialsPlaceholder } from "@/components/sections";
import { DataTabs } from "@/components/sections/DataTabs";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Platform", description: "One workspace to discover, qualify and monitor private companies." };

function Grid4({ prefix, keys }: { prefix: string; keys: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {keys.map((k, i) => (
        <Reveal key={k} index={i}>
          <FeatureCard className="h-full" title={t(`${prefix}.${k}.title`)} body={t(`${prefix}.${k}.body`)} />
        </Reveal>
      ))}
    </div>
  );
}

export default async function Platform() {
  const vars = await getStatVars();
  const rows = ["latam", "live", "talent", "estimates", "nl", "api"];
  return (
    <>
      <PageHero id="platform.hero" eyebrow={t("platform.hero.eyebrow")} h1={t("platform.hero.h1")} sub={t("platform.hero.sub")}>
        <Reveal>
          <CompaniesDbMock count={String(vars["stats.companies"] ?? "")} />
        </Reveal>
      </PageHero>
      <LogoWall id="platform.logos" />

      <Section id="platform.discovery" anchor="discovery">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-8">
            <Header2 prefix="platform.discovery" />
            <Grid4 prefix="platform.discovery" keys={["searches", "lists", "ecosystem", "trends"]} />
          </div>
          <div className="flex flex-col gap-4">
            <NlSearchDemo
              prompt="B2B companies in Latin America building AI agents, 11–50 employees"
              chips={["Region is Latin America", "Customer Focus is B2B", "Tech Vertical is AI Agents and Process Copilots", "Company Size is 11-50"]}
              result="Saved as a live search · new matches flagged daily"
            />
            <Card className="p-4">
              <p className="mb-3 text-[12px] text-muted">Momentum · headcount growth (3m)</p>
              {FIX.growth.slice(0, 6).map((c) => (
                <div key={String(c.id)} className="flex items-center justify-between border-t border-line py-2 text-[13px]">
                  <span className="text-ink">{String(c.name)}</span>
                  <span className="tabular text-positive">+{Math.round(Number(c.headcount_growth_3m) * 100)}%</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </Section>

      <Section id="platform.sourcing">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <CompanyProfileMock />
          </Reveal>
          <div className="flex flex-col gap-8">
            <Header2 prefix="platform.sourcing" />
            <Card className="p-4">
              <p className="mb-3 text-[12px] text-muted">Team composition · example</p>
              <StackBar parts={[{ label: "Engineering", value: 52 }, { label: "Sales", value: 21 }, { label: "Product", value: 14 }, { label: "Operations", value: 13 }]} />
            </Card>
            <Grid4 prefix="platform.sourcing" keys={["people", "team", "firmographics", "contacts"]} />
          </div>
        </div>
      </Section>

      <Section id="platform.monitoring">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-8">
            <Header2 prefix="platform.monitoring" />
            <Grid4 prefix="platform.monitoring" keys={["growth", "estimates", "digests", "news"]} />
          </div>
          <Reveal>
            <SavedSearchesMock />
          </Reveal>
        </div>
      </Section>

      <Section id="platform.data">
        <Header2 prefix="platform.data" />
        <div className="mt-8">
          <StatStrip
            items={[
              { value: String(vars["stats.companies"]), label: t("home.data.companies.title") },
              { value: String(vars["stats.people"]), label: t("home.data.people.title") },
              { value: String(vars["stats.investors"]), label: t("home.data.investors.title") },
              { value: String(vars["stats.transactions"]), label: t("home.data.transactions.title") },
            ]}
          />
        </div>
        <div className="mt-8">
          <DataTabs
            tabs={["companies", "people", "investors", "transactions"].map((k) => ({ id: k, label: t(`home.data.${k}.title`), body: t(`home.data.${k}.body`, vars) }))}
          />
        </div>
      </Section>

      <Section id="platform.comparison">
        <SectionHeader eyebrow={t("platform.comparison.eyebrow")} title={t("platform.comparison.h2")} />
        <Card className="mt-8 overflow-hidden">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-medium">Capability</th>
                <th className="px-5 py-3 text-center font-medium text-accent">Founders AI</th>
                <th className="px-5 py-3 text-center font-medium">Typical global database</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r} className="border-b border-line/60">
                  <td className="px-5 py-3 text-text">{t(`platform.comparison.rows.${r}`)}</td>
                  <td className="px-5 py-3 text-center">
                    <Check size={16} className="inline text-accent" aria-label="Yes" />
                  </td>
                  <td className="px-5 py-3 text-center">
                    {i === 5 ? <Check size={16} className="inline text-muted" aria-label="Often" /> : <Minus size={16} className="inline text-faint" aria-label="Varies" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-3 text-[12px] text-faint">{t("platform.comparison.footnote")}</p>
      </Section>

      <TestimonialsPlaceholder id="platform.testimonials" />
      <ClosingCta id="platform.closing" vars={vars} />
    </>
  );
}
