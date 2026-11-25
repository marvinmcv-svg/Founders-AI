import { brand } from "@founders/config";
import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, Landmark, TrendingUp, Users } from "lucide-react";
import { buttonClass, Card, cn, Eyebrow, FeatureCard, SectionHeader } from "@founders/ui";
import { CodeBlock, EndpointPill } from "@founders/ui/code";
import { Reveal } from "@founders/ui/motion";
import { t, type Vars } from "@/lib/copy";
import { appUrl } from "@/lib/nav";

/** Every section carries data-section="page.section" for the structural-parity test (plan 15). */
export function Section({ id, children, className, anchor }: { id: string; children: ReactNode; className?: string; anchor?: string }) {
  return (
    <section data-section={id} id={anchor} className={cn("mx-auto max-w-[1200px] px-5 py-20 md:py-28", className)}>
      {children}
    </section>
  );
}

export function PageHero({ id, eyebrow, h1, sub, children, ctas = true }: { id: string; eyebrow: string; h1: string; sub: string; children?: ReactNode; ctas?: boolean }) {
  return (
    <section data-section={id} className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(216,255,74,0.12),transparent_60%)]" />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-5 pb-10 pt-16 text-center md:pt-24">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="max-w-4xl text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] md:text-[72px]">{h1}</h1>
        <p className="max-w-2xl text-pretty text-[17px] text-muted md:text-[19px]">{sub}</p>
        {ctas ? (
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/contact" className={buttonClass("primary", "lg")}>
              {t("global.cta.bookDemo")}
            </Link>
            <Link href="/platform" className={buttonClass("secondary", "lg")}>
              {t("home.hero.secondary")}
            </Link>
          </div>
        ) : null}
      </div>
      {children ? <div className="relative mx-auto max-w-[1200px] px-5 pb-8">{children}</div> : null}
    </section>
  );
}

/** Logo wall component; empty state until we have real customers with permission (plan Rule 3). */
export function LogoWall({ id }: { id: string }) {
  return (
    <section data-section={id} className="mx-auto max-w-[1200px] px-5 py-10">
      <p className="text-center text-[12px] uppercase tracking-[0.14em] text-faint">{t("global.proof.logosTitle")}</p>
      <div className="mt-5 rounded-[12px] border border-dashed border-line px-6 py-6 text-center text-[13px] text-muted">{t("global.proof.logosEmpty")}</div>
    </section>
  );
}

export function TestimonialsPlaceholder({ id }: { id: string }) {
  return (
    <section data-section={id} className="mx-auto max-w-[1200px] px-5 py-8">
      <Card className="px-6 py-8 text-center text-[14px] text-muted">{t("global.proof.testimonialsEmpty")}</Card>
    </section>
  );
}

export function ClosingCta({ id, vars }: { id: string; vars: Vars }) {
  return (
    <section data-section={id} data-closing-cta className="mx-auto max-w-[1200px] px-5 py-16">
      <div className="relative overflow-hidden rounded-[24px] border border-line-strong bg-paper px-6 py-16 text-center md:px-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(216,255,74,0.16),transparent_65%)]" />
        <div className="relative flex flex-col items-center gap-5">
          <h2 className="max-w-3xl text-balance text-[36px] font-semibold leading-[1.05] md:text-[56px]">{t("global.closing.h2")}</h2>
          <p className="max-w-2xl text-[16px] text-muted">{t("global.closing.body", vars)}</p>
          <Link href="/contact" className={buttonClass("primary", "lg")}>
            {t("global.closing.cta")}
          </Link>
          <p className="text-[12px] text-faint">{t("global.demoData")}</p>
        </div>
      </div>
    </section>
  );
}

export function FourCards({ prefix, vars, icons = true }: { prefix: string; vars?: Vars; icons?: boolean }) {
  const ic = [<Building2 key="a" size={18} />, <TrendingUp key="b" size={18} />, <Landmark key="c" size={18} />, <Users key="d" size={18} />];
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {["c1", "c2", "c3", "c4"].map((k, i) => (
        <Reveal key={k} index={i}>
          <FeatureCard className="h-full" icon={icons ? ic[i] : undefined} title={t(`${prefix}.${k}.title`, vars)} body={t(`${prefix}.${k}.body`, vars)} />
        </Reveal>
      ))}
    </div>
  );
}

export function Header2({ prefix, vars, align, action }: { prefix: string; vars?: Vars; align?: "left" | "center"; action?: ReactNode }) {
  const lede = t(`${prefix}.lede`, vars);
  return <SectionHeader eyebrow={t(`${prefix}.eyebrow`, vars)} title={t(`${prefix}.h2`, vars)} lede={lede.startsWith("[TODO-COPY") ? undefined : lede} align={align} action={action} />;
}

const APP = brand.urls.app;
const CURL = (path: string) => `curl -H "X-API-Key: $FOUNDERS_API_KEY" \\\n  "${APP}/api/v1${path}"`;
const PY = (path: string) => `import requests\n\nres = requests.get(\n    "${APP}/api/v1${path}",\n    headers={"X-API-Key": FOUNDERS_API_KEY},\n)\nprint(res.json())`;
const JS = (path: string) => `const res = await fetch("${APP}/api/v1${path}", {\n  headers: { "X-API-Key": process.env.FOUNDERS_API_KEY },\n});\nconsole.log(await res.json());`;

/** API promo block (plan 5.5 #6): endpoint pills + code sample. */
export function ApiPromo({ id, title, lede, endpoints, samplePath, sampleJson }: { id: string; title: string; lede: string; endpoints: [string, string][]; samplePath: string; sampleJson: string }) {
  return (
    <Section id={id}>
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <SectionHeader eyebrow="API" title={title} lede={lede} />
          <div className="flex flex-col gap-2">
            {endpoints.map(([m, p]) => (
              <EndpointPill key={p + m} method={m} path={p} />
            ))}
          </div>
          <a href={appUrl("/developers")} className={buttonClass("link")}>
            {t("global.cta.seeDocs")} →
          </a>
        </div>
        <CodeBlock
          tabs={[
            { label: "Response", code: sampleJson, lang: "json" },
            { label: "cURL", code: CURL(samplePath), lang: "bash" },
            { label: "Python", code: PY(samplePath), lang: "python" },
            { label: "JavaScript", code: JS(samplePath), lang: "js" },
          ]}
        />
      </div>
    </Section>
  );
}

export function StatStrip({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line md:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-paper px-5 py-6">
          <p className="font-display text-[34px] font-semibold text-ink">{s.value}</p>
          <p className="text-[13px] text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
