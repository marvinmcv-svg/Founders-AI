import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Eyebrow } from "@founders/ui";
import { t } from "@/lib/copy";

const TITLES: Record<string, string> = {
  "talent-signals": "Talent Signals",
  "interest-signals": "Interest Signals",
  news: "News",
  "revenue-valuation": "Revenue & Valuation",
  agents: "Agents",
  mcp: "MCP",
  integrations: "Integrations",
  blog: "Blog",
  insights: "Insights",
  careers: "Careers",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: TITLES[slug] ?? "Coming soon", robots: { index: false } };
}

export function generateStaticParams() {
  return Object.keys(TITLES).map((slug) => ({ slug }));
}

/** Links to R2/R3 pages land here instead of a 404 (plan Phase 1). */
export default async function Soon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section data-section="soon.main" className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-5 py-32 text-center">
      <Eyebrow>{TITLES[slug] ?? t("comingSoon.h1")}</Eyebrow>
      <h1 className="text-[48px] font-semibold">{t("comingSoon.h1")}</h1>
      <p className="text-[16px] text-muted">{t("comingSoon.body")}</p>
      <Link href="/contact" className={buttonClass("primary", "lg")}>
        {t("global.cta.bookDemo")}
      </Link>
    </section>
  );
}
