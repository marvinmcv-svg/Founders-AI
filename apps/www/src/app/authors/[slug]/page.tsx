import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogoMark } from "@founders/ui";
import { PostCard } from "@/components/blog/PostCard";
import { AUTHORS, allPosts, author } from "@/lib/blog";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(AUTHORS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = author(slug);
  return { title: a.name, description: a.bio, alternates: { canonical: `/authors/${slug}` } };
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!AUTHORS[slug]) notFound();
  const a = author(slug);
  const posts = allPosts().filter((p) => p.author === slug);
  return (
    <section data-section="author.page" className="mx-auto max-w-[1240px] px-5 pb-20 pt-16">
      <div className="flex items-center gap-4">
        <LogoMark size={56} />
        <div>
          <h1 className="text-[36px] font-semibold tracking-[-0.03em]">{a.name}</h1>
          <p className="text-[14px] text-muted">{a.role}</p>
        </div>
      </div>
      <p className="mt-6 max-w-2xl text-[16px] text-text">{a.bio}</p>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </section>
  );
}
