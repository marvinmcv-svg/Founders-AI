import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card } from "@founders/ui";
import { Block, ProductHero } from "@/components/sections/kit";
import { allComparisons } from "@/lib/comparisons";
import { pageMeta } from "@/lib/meta";
import { t } from "@/lib/copy";

export const metadata: Metadata = pageMeta({ title: t("comparisons.meta.title"), description: t("comparisons.meta.description"), path: "/comparisons", kicker: t("comparisons.hero.eyebrow"), ogTitle: `${t("comparisons.hero.h1")} ${t("comparisons.hero.h1Accent")}` });

export default function Comparisons() {
  const list = allComparisons();
  return (
    <>
      <ProductHero id="comparisons.hero" prefix="comparisons.hero" />
      <Block id="comparisons.list" prefix="comparisons.list">
        {list.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <Link key={c.slug} href={`/comparisons/${c.slug}`} className="rounded-[20px] border border-line bg-paper p-6 hover:border-accent/40">
                <h3 className="text-[20px] font-semibold">{c.title}</h3>
                <p className="mt-2 text-[14px] text-muted">{c.description}</p>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-start gap-4 p-8 md:flex-row md:items-center">
            <p className="flex-1 text-[15px] text-muted">{t("comparisons.list.empty")}</p>
            <Link href="/contact" className={buttonClass("secondary", "md")}>
              {t("global.cta.talkToUs")}
            </Link>
          </Card>
        )}
      </Block>
    </>
  );
}
