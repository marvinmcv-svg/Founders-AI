import type { Metadata } from "next";

/** Unique title/description, canonical URL and a branded OG image per page (plan 17 SEO). */
export function pageMeta({ title, description, path, kicker, ogTitle, type = "website" }: { title: string; description: string; path: string; kicker?: string; ogTitle?: string; type?: "website" | "article" }): Metadata {
  const og = `/og?${new URLSearchParams({ title: ogTitle ?? title, kicker: kicker ?? title }).toString()}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type, title, description, url: path, images: [{ url: og, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}
