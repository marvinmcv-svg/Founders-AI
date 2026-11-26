import type { Metadata } from "next";
import { DemoForm } from "@/components/forms";
import { t, tList } from "@/lib/copy";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export const metadata: Metadata = { title: "Book a demo", description: "See Founders AI on your own thesis." };

const KEYS = ["firstName", "lastName", "email", "company", "firmType", "aum", "phone", "optional", "submit", "submitting", "freeMail", "required", "success", "successBook", "error"];

export default async function Contact() {
  const vars = await getStatVars();
  const labels = Object.fromEntries(KEYS.map((k) => [k, t(`contact.form.${k}`)]));
  const benefits = tList("contact.benefits.items", vars);
  return (
    <section data-section="contact.main" className="mx-auto grid max-w-[1200px] gap-12 px-5 py-16 lg:grid-cols-[1fr_1fr]">
      <div>
        <h1 className="text-[44px] font-semibold leading-tight md:text-[56px]">{t("contact.h1")}</h1>
        <p className="mt-3 max-w-md text-[16px] text-muted">{t("contact.sub")}</p>
        <div className="mt-8">
          <DemoForm labels={labels} firmTypes={tList("contact.firmTypes")} aum={tList("contact.aum")} calLink={process.env.NEXT_PUBLIC_CALCOM_LINK || undefined} />
        </div>
      </div>
      <div className="relative hidden h-[680px] overflow-hidden rounded-[20px] border border-line bg-paper p-8 lg:block">
        <h2 className="text-[28px] font-semibold">{t("contact.benefits.h2")}</h2>
        <div className="mt-6 h-[560px] overflow-hidden mask-fade-b">
          <div className="flex animate-[marquee-v_60s_linear_infinite] flex-col gap-3 hover:[animation-play-state:paused]">
            {[...benefits, ...benefits].map((b, i) => {
              const [label, ...rest] = b.split(" — ");
              return (
                <div key={i} className="rounded-xl border border-line bg-raised p-4 text-[14px]" aria-hidden={i >= benefits.length}>
                  <span className="font-medium text-ink">{label}</span>
                  {rest.length ? <span className="text-muted"> — {rest.join(" — ")}</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee-v { from { transform: translateY(0) } to { transform: translateY(-50%) } }`}</style>
    </section>
  );
}
