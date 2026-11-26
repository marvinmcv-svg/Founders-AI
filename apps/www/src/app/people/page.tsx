import type { Metadata } from "next";
import { PEOPLE_HIGHLIGHTS } from "@founders/core/taxonomy";
import { Chip } from "@founders/ui";
import { Reveal } from "@founders/ui/motion";
import { FIX, PeopleDbMock, PersonCardMock, TalentMock } from "@founders/mocks";
import { ApiPromo, ClosingCta, FourCards, Header2, LogoWall, PageHero, Section } from "@/components/sections";
import { t } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: "People", description: "Founders and operators with career history, highlights and talent signals." };

export default async function People() {
  const vars = await getStatVars();
  const p = FIX.person.person;
  return (
    <>
      <PageHero id="people.hero" eyebrow={t("people.hero.eyebrow")} h1={t("people.hero.h1")} sub={t("people.hero.sub", vars)}>
        <Reveal>
          <PeopleDbMock />
        </Reveal>
      </PageHero>
      <LogoWall id="people.logos" />
      <Section id="people.overview">
        <Header2 prefix="people.overview" />
        <div className="mt-10">
          <FourCards prefix="people.overview" />
        </div>
      </Section>
      <Section id="people.highlights">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-6">
            <Header2 prefix="people.highlights" />
            <div className="flex flex-wrap gap-2">
              {PEOPLE_HIGHLIGHTS.map((h) => (
                <Chip key={h} active>
                  {h}
                </Chip>
              ))}
            </div>
          </div>
          <Reveal>
            <PersonCardMock />
          </Reveal>
        </div>
      </Section>
      <Section id="people.signals">
        <Header2 prefix="people.signals" />
        <Reveal className="mt-10">
          <TalentMock />
        </Reveal>
      </Section>
      <ApiPromo
        id="people.api"
        title="People data, programmatically."
        lede="Resolve a LinkedIn URL or email to a person ID, then pull their profile, signals and verified email."
        endpoints={[
          ["POST", "/people/resolve"],
          ["GET", "/people/{personId}"],
          ["GET", "/people/{personId}/email"],
          ["GET", "/people/{personId}/talent-signals"],
          ["GET", "/searches/people/{searchId}/results"],
        ]}
        samplePath={`/people/${String(p.id)}`}
        sampleJson={JSON.stringify({ id: p.id, full_name: p.full_name, headline: p.headline, location: p.location, seniority: p.seniority, years_experience: p.years_experience, highlights: p.highlights }, null, 2)}
      />
      <Section id="people.privacy" className="py-6">
        <p className="text-center text-[13px] text-muted">
          {t("people.privacy")}{" "}
          <a href="/privacy-rights" className="text-accent hover:underline">
            {t("global.footer.links.privacyRights")} →
          </a>
        </p>
      </Section>
      <ClosingCta id="people.closing" vars={vars} />
    </>
  );
}
