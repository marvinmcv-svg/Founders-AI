import type { Metadata } from "next";
import { Card } from "@founders/ui";
import { PostCard } from "@/components/blog/PostCard";
import { Newsletter } from "@/components/blog/Newsletter";
import { Block, ProductHero } from "@/components/sections/kit";
import { postsByTag } from "@/lib/blog";
import { pageMeta } from "@/lib/meta";
import { t } from "@/lib/copy";
import { newsletterCopy } from "@/lib/newsletter";

export const metadata: Metadata = pageMeta({ title: t("insights.meta.title"), description: t("insights.meta.description"), path: "/insights", kicker: t("insights.hero.eyebrow"), ogTitle: `${t("insights.hero.h1")} ${t("insights.hero.h1Accent")}` });

export default function Insights() {
  const research = postsByTag("insights");
  const cases = postsByTag("case-studies");
  return (
    <>
      <ProductHero id="insights.hero" prefix="insights.hero" />
      <section data-section="insights.newsletter" className="mx-auto max-w-[1240px] px-5 pb-8">
        <Newsletter copy={newsletterCopy()} />
      </section>
      <Block id="insights.posts" prefix="insights.posts">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {research.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </Block>
      <Block id="insights.cases" prefix="insights.cases">
        {cases.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cases.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        ) : (
          <Card className="px-6 py-8 text-center text-[14px] text-muted">{t("insights.cases.empty")}</Card>
        )}
      </Block>
    </>
  );
}
