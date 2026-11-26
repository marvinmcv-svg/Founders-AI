import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand } from "@founders/config";
import { Accordion } from "@founders/ui/code";
import { Kicker, CtaBand } from "@/components/sections/kit";
import { allComparisons, getComparison } from "@/lib/comparisons";
import { formatDate } from "@/lib/blog";
import { t } from "@/lib/copy";

export const dynamicParams = false;
export function generateStaticParams() {
  return allComparisons().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getComparison(slug);
  return c ? { title: c.title, description: c.description, alternates: { canonical: `/comparisons/${slug}` }, openGraph: { type: "article", modifiedTime: c.asOf } } : {};
}

const T = (k: string) => t(`comparisons.template.${k}`);
const show = (v: string) => (v === "yes" ? T("yes") : v === "no" ? T("no") : v === "partial" ? T("partial") : v);

/** Comparison template (plan 6.17): overview → which to choose → features → differences → pricing → FAQ → methodology. */
export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) notFound();
  return (
    <>
      <section data-section="comparison.hero" className="mx-auto max-w-[1100px] px-5 pb-10 pt-16">
        <Kicker>{t("comparisons.hero.eyebrow")}</Kicker>
        <h1 className="mt-5 text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] md:text-[64px]">{c.title}</h1>
        <p className="mt-5 max-w-2xl text-[17px] text-muted">{c.description}</p>
        <p className="mt-4 text-[13px] text-faint">
          {T("asOf")} {formatDate(c.asOf)}
        </p>
      </section>
      <section data-section="comparison.overview" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("overview")}</h2>
        <div className="mt-6 overflow-x-auto rounded-[16px] border border-line">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-sunken text-faint">
              <tr>
                <th className="px-4 py-3" />
                <th className="px-4 py-3 text-accent">{brand.name}</th>
                <th className="px-4 py-3">{c.competitor}</th>
              </tr>
            </thead>
            <tbody>
              {(["whatItIs", "bestAt", "bestFor"] as const).map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className="px-4 py-3 text-muted">{T(k)}</td>
                  <td className="px-4 py-3 text-ink">{c.overview.us[k]}</td>
                  <td className="px-4 py-3 text-text">{c.overview.them[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section data-section="comparison.choose" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("choose")}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {c.choose.map((x) => (
            <div key={x.title} className="rounded-[16px] border border-line bg-paper p-5">
              <h3 className="text-[18px] font-semibold">{x.title}</h3>
              <p className="mt-2 text-[14px] text-muted">{x.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section data-section="comparison.features" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("features")}</h2>
        {c.features.map((g) => (
          <div key={g.group} className="mt-6 overflow-x-auto rounded-[16px] border border-line">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-sunken">
                <tr>
                  <th className="px-4 py-3 text-ink">{g.group}</th>
                  <th className="w-40 px-4 py-3 text-accent">{brand.name}</th>
                  <th className="w-40 px-4 py-3 text-faint">{c.competitor}</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.feature} className="border-t border-line">
                    <td className="px-4 py-2.5 text-text">{r.feature}</td>
                    <td className="px-4 py-2.5 text-ink">{show(r.us)}</td>
                    <td className="px-4 py-2.5 text-muted">{show(r.them)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
      <section data-section="comparison.differences" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("differences")}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {c.differences.map((x) => (
            <div key={x.title} className="rounded-[16px] border border-line bg-paper p-5">
              <h3 className="text-[18px] font-semibold">{x.title}</h3>
              <p className="mt-2 text-[14px] text-muted">{x.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section data-section="comparison.pricing" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("pricing")}</h2>
        <div className="mt-6 overflow-x-auto rounded-[16px] border border-line">
          <table className="w-full text-left text-[14px]">
            <tbody>
              {c.pricing.map((p) => (
                <tr key={p.label} className="border-t border-line first:border-0">
                  <td className="px-4 py-3 text-muted">{p.label}</td>
                  <td className="px-4 py-3 text-ink">{p.us}</td>
                  <td className="px-4 py-3 text-text">{p.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section data-section="comparison.faq" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("faq")}</h2>
        <Accordion className="mt-6" items={c.faq.map((f) => ({ q: f.q, a: f.a }))} />
      </section>
      <section data-section="comparison.methodology" className="mx-auto max-w-[1100px] px-5 py-10">
        <h2 className="text-[28px] font-semibold">{T("methodology")}</h2>
        <p className="mt-3 text-[14px] text-muted">
          {T("asOf")} {formatDate(c.asOf)}. {T("contact")}
        </p>
        <ul className="mt-4 flex flex-col gap-1.5 text-[14px]">
          {c.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {s.label}
              </a>{" "}
              <span className="text-faint">· {formatDate(s.accessed)}</span>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand id="comparison.closing" h2={t("global.closing.h2")} body={c.description} />
    </>
  );
}
