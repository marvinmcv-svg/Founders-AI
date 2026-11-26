import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { brand } from "@founders/config";
import { PostCard } from "@/components/blog/PostCard";
import { Newsletter } from "@/components/blog/Newsletter";
import { Kicker } from "@/components/sections/kit";
import { allPosts, author, formatDate, getPost, relatedPosts, renderMarkdown } from "@/lib/blog";
import { fill, t } from "@/lib/copy";
import { newsletterCopy } from "@/lib/newsletter";
import { pageMeta } from "@/lib/meta";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) return {};
  const vars = await getStatVars();
  const base = pageMeta({ title: p.title, description: fill(p.description, vars), path: `/blog/${p.slug}`, kicker: p.tags[0] ?? "Blog", type: "article" });
  return { ...base, openGraph: { ...base.openGraph, type: "article", publishedTime: p.date, modifiedTime: p.updated ?? p.date, authors: [author(p.author).name], tags: p.tags } };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const vars = await getStatVars();
  const a = author(post.author);
  const html = renderMarkdown(post.body, vars);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: fill(post.description, vars),
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Organization", name: a.name, url: `${brand.urls.www}/authors/${a.slug}` },
    publisher: { "@type": "Organization", name: brand.name, logo: { "@type": "ImageObject", url: `${brand.urls.www}/founders-mark.jpg` } },
    mainEntityOfPage: `${brand.urls.www}/blog/${post.slug}`,
    keywords: post.tags.join(", "),
  };
  return (
    <>
      <article data-section="post.article" className="mx-auto max-w-[760px] px-5 pb-16 pt-14 md:pt-20">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <ArrowLeft size={14} /> {t("blog.back")}
        </Link>
        <div className="mt-10">
          <Kicker>{post.tags.join(" · ")}</Kicker>
        </div>
        <h1 className="mt-5 text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] md:text-[56px]">{post.title}</h1>
        <p className="mt-5 text-[18px] text-muted">{fill(post.description, vars)}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-line pb-8 text-[13px] text-faint">
          <span>
            {t("blog.by")}{" "}
            <Link href={`/authors/${a.slug}`} className="text-text hover:text-ink">
              {a.name}
            </Link>
          </span>
          <span>·</span>
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          {post.updated ? (
            <>
              <span>·</span>
              <span>
                {t("blog.updated")} {formatDate(post.updated)}
              </span>
            </>
          ) : null}
          <span>·</span>
          <span>
            {post.readingMinutes} {t("blog.minRead")}
          </span>
        </div>
        <div className="prose-founders mt-10" dangerouslySetInnerHTML={{ __html: html }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </article>
      <section data-section="post.newsletter" className="mx-auto max-w-[760px] px-5 pb-10">
        <Newsletter copy={newsletterCopy()} />
      </section>
      <section data-section="post.related" className="mx-auto max-w-[1240px] px-5 pb-16 pt-10">
        <h2 className="mb-6 text-[28px] font-semibold tracking-[-0.03em]">{t("blog.related")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {relatedPosts(post).map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </section>
    </>
  );
}
