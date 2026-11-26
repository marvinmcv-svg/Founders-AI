import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@founders/ui";
import { formatDate, type Post } from "@/lib/blog";
import { t } from "@/lib/copy";

export function PostCard({ post, featured }: { post: Post; featured?: boolean }) {
  return (
    <Link href={`/blog/${post.slug}`} data-track="blog_post_click" data-track-label={post.slug} className={cn("group flex h-full flex-col justify-between rounded-[20px] border p-6 transition-all duration-300 hover:-translate-y-1", featured ? "border-accent/40 bg-[linear-gradient(160deg,rgba(216,255,74,0.12),transparent_55%)] md:p-10" : "border-line bg-paper hover:border-accent/40")}>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
          <span>{formatDate(post.date)}</span>
          <span>·</span>
          <span>
            {post.readingMinutes} {t("blog.minRead")}
          </span>
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-muted">
              {tag}
            </span>
          ))}
        </div>
        <h3 className={cn("mt-5 text-balance font-semibold leading-tight tracking-[-0.03em]", featured ? "text-[32px] md:text-[48px]" : "text-[22px]")}>{post.title}</h3>
        <p className={cn("mt-3 text-muted", featured ? "max-w-2xl text-[17px]" : "text-[14.5px]")}>{post.description}</p>
      </div>
      <ArrowUpRight size={18} className="mt-8 text-accent transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
