import type { Metadata } from "next";
import Link from "next/link";
import { PostCard } from "@/components/blog/PostCard";
import { Newsletter } from "@/components/blog/Newsletter";
import { ProductHero } from "@/components/sections/kit";
import { allPosts, allTags } from "@/lib/blog";
import { t } from "@/lib/copy";
import { pageMeta } from "@/lib/meta";
import { newsletterCopy } from "@/lib/newsletter";

export const metadata: Metadata = {
  ...pageMeta({ title: t("blog.meta.title"), description: t("blog.meta.description"), path: "/blog", kicker: t("blog.hero.eyebrow"), ogTitle: `${t("blog.hero.h1")} ${t("blog.hero.h1Accent")}` }),
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function Blog() {
  const posts = allPosts();
  const [first, ...rest] = posts;
  return (
    <>
      <ProductHero id="blog.hero" prefix="blog.hero" />
      <section data-section="blog.posts" className="mx-auto max-w-[1240px] px-5 pb-16">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-accent">{t("blog.all")}</span>
          {allTags().map((tag) => (
            <Link key={tag} href={`/blog/tag/${tag}`} className="rounded-full border border-line px-3 py-1 text-muted hover:text-ink">
              {tag}
            </Link>
          ))}
          <a href="/blog/rss.xml" className="ml-auto text-faint hover:text-ink">
            {t("blog.rss")}
          </a>
        </div>
        {first ? (
          <div className="grid gap-4">
            <PostCard post={first} featured />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted">{t("blog.empty")}</p>
        )}
      </section>
      <section data-section="blog.newsletter" className="mx-auto max-w-[1240px] px-5 pb-16">
        <Newsletter copy={newsletterCopy()} />
      </section>
    </>
  );
}
