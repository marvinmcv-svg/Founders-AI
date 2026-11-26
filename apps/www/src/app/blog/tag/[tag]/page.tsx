import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/blog/PostCard";
import { Kicker } from "@/components/sections/kit";
import { allTags, postsByTag } from "@/lib/blog";
import { t } from "@/lib/copy";

export const dynamicParams = false;
export function generateStaticParams() {
  return allTags().map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  return { title: `${t("blog.meta.title")} · ${tag}`, alternates: { canonical: `/blog/tag/${tag}` } };
}

export default async function Tag({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const posts = postsByTag(tag);
  if (!posts.length) notFound();
  return (
    <section data-section="blog.tag" className="mx-auto max-w-[1240px] px-5 pb-20 pt-16">
      <Link href="/blog" className="text-[13px] text-muted hover:text-ink">
        ← {t("blog.back")}
      </Link>
      <div className="mt-8">
        <Kicker>{t("blog.tagged")}</Kicker>
      </div>
      <h1 className="mt-4 text-[44px] font-semibold tracking-[-0.04em] md:text-[64px]">{tag}</h1>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </section>
  );
}
