import type { Metadata } from "next";
import { Card, FeatureCard } from "@founders/ui";
import { PartnerForm } from "@/components/forms";
import { ClosingCta, LogoWall, PageHero, Section } from "@/components/sections";
import { t, tList, tObjects } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: "Partners", description: "Partner with Founders AI." };

export default async function Partners() {
  const vars = await getStatVars();
  const labels = {
    firstName: t("contact.form.firstName"),
    lastName: t("contact.form.lastName"),
    email: t("contact.form.email"),
    type: t("partners.form.type"),
    idea: t("partners.form.idea"),
    submit: t("partners.form.submit"),
    success: t("partners.form.success"),
    error: t("contact.form.error"),
  };
  return (
    <>
      <PageHero id="partners.hero" eyebrow={t("partners.hero.eyebrow")} h1={t("partners.hero.h1")} sub={t("partners.hero.sub")} ctas={false} />
      <LogoWall id="partners.logos" />
      <Section id="partners.types">
        <h2 className="text-[36px] font-semibold">{t("partners.types.h2")}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {["technology", "solution", "creator"].map((k) => (
            <FeatureCard key={k} title={t(`partners.types.${k}.title`)} body={t(`partners.types.${k}.body`)} />
          ))}
        </div>
      </Section>
      <Section id="partners.why">
        <h2 className="text-[36px] font-semibold">{t("partners.why.h2")}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {tObjects<{ title: string; body: string }>("partners.why.items").map((it, i) => (
            <Card key={it.title} className="p-6">
              <p className="font-display text-[28px] text-accent">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-2 text-[17px] font-semibold text-ink">{it.title}</p>
              <p className="mt-1 text-[14px] text-muted">{it.body}</p>
            </Card>
          ))}
        </div>
      </Section>
      <Section id="partners.form" anchor="apply">
        <Card className="mx-auto max-w-2xl p-8">
          <h2 className="mb-6 text-[28px] font-semibold">{t("partners.form.h2")}</h2>
          <PartnerForm labels={labels} types={tList("partners.form.types")} />
        </Card>
      </Section>
      <ClosingCta id="partners.closing" vars={vars} />
    </>
  );
}
