import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonClass, Card } from "@founders/ui";
import { Block, CardGrid, ProductHero } from "@/components/sections/kit";
import { openRoles } from "@/lib/careers";
import { pageMeta } from "@/lib/meta";
import { t } from "@/lib/copy";

export const revalidate = 3600;
export const metadata: Metadata = pageMeta({ title: t("careers.meta.title"), description: t("careers.meta.description"), path: "/careers", kicker: t("careers.hero.eyebrow"), ogTitle: `${t("careers.hero.h1")} ${t("careers.hero.h1Accent")}` });

export default async function Careers() {
  const roles = await openRoles();
  return (
    <>
      <ProductHero id="careers.hero" prefix="careers.hero" />
      <Block id="careers.values" prefix="careers.values">
        <CardGrid prefix="careers.values" />
      </Block>
      <Block id="careers.roles" prefix="careers.roles">
        {roles.length ? (
          <div className="flex flex-col gap-2">
            {roles.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-[14px] border border-line bg-paper px-5 py-4 hover:border-accent/40">
                <span className="text-[16px] text-ink">{r.title}</span>
                <span className="text-[13px] text-muted">
                  {r.team}
                  {r.team && r.location ? " · " : ""}
                  {r.location}
                </span>
                <ArrowUpRight size={16} className="ml-auto text-accent" />
              </a>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-start gap-4 p-8 md:flex-row md:items-center">
            <p className="flex-1 text-[15px] text-muted">{t("careers.roles.empty")}</p>
            <Link href="/contact" className={buttonClass("secondary", "md")}>
              {t("careers.roles.cta")}
            </Link>
          </Card>
        )}
      </Block>
    </>
  );
}
