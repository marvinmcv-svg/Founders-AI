import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { buttonClass, Card, cn } from "@founders/ui";
import { Accordion } from "@founders/ui/code";
import { ClosingCta, LogoWall, PageHero, Section } from "@/components/sections";
import { t, tList, tObjects } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Pricing", description: "Platform seats, API credits and bulk data — talk to us for pricing." };

export default async function Pricing() {
  const vars = await getStatVars();
  const faq = tObjects<{ q: string; a: string }>("pricing.faq.items");
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <PageHero id="pricing.hero" eyebrow={t("pricing.hero.eyebrow")} h1={t("pricing.hero.h1")} sub={t("pricing.hero.sub")} ctas={false} />
      <Section id="pricing.plans" className="pt-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {["platform", "api", "bulk"].map((k, i) => (
            <Card key={k} id={k} className={cn("flex flex-col gap-5 p-7", i === 0 && "border-accent/40 shadow-[var(--shadow-glow)]")}>
              <div>
                <h2 className="text-[24px] font-semibold">{t(`pricing.plans.${k}.name`)}</h2>
                <p className="text-[14px] text-muted">{t(`pricing.plans.${k}.desc`)}</p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {tList(`pricing.plans.${k}.features`, vars).map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-text">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/contact" className={buttonClass(i === 0 ? "primary" : "secondary", "md", "mt-auto")}>
                {t("pricing.plans.cta")}
              </Link>
            </Card>
          ))}
        </div>
      </Section>
      <Section id="pricing.faq">
        <h2 className="mb-8 text-center text-[36px] font-semibold">{t("pricing.faq.h2")}</h2>
        <Accordion className="mx-auto max-w-3xl" items={faq} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Section>
      <LogoWall id="pricing.logos" />
      <ClosingCta id="pricing.closing" vars={vars} />
    </>
  );
}
