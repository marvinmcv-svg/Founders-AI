import type { Metadata } from "next";
import { DsarForm } from "@/components/forms";
import { t } from "@/lib/copy";

export const metadata: Metadata = { title: "Privacy rights", description: "Request access to or deletion of your profile." };

export default async function PrivacyRights({ searchParams }: { searchParams: Promise<{ type?: string; verified?: string }> }) {
  const { type, verified } = await searchParams;
  const k = (x: string) => t(`legal.privacyRights.${x}`);
  return (
    <section data-section="legal.privacy-rights" className="mx-auto max-w-2xl px-5 py-16">
      <p className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning">{t("legal.draftNotice")}</p>
      <h1 className="text-[44px] font-semibold">{k("h1")}</h1>
      <p className="mb-8 mt-3 text-[16px] text-muted">{k("intro")}</p>
      {verified === "1" ? <p role="status" className="mb-6 rounded-[12px] border border-accent/30 bg-accent-soft p-4 text-[15px] text-ink">{k("verified")}</p> : null}
      {verified === "0" ? <p role="alert" className="mb-6 rounded-[12px] border border-negative/30 bg-negative/10 p-4 text-[15px] text-ink">{k("verifyFailed")}</p> : null}
      <DsarForm
        defaultType={type === "DELETE" || type === "OPT_OUT" ? type : "ACCESS"}
        types={{ ACCESS: k("types.ACCESS"), DELETE: k("types.DELETE"), OPT_OUT: k("types.OPT_OUT") }}
        labels={{ type: k("type"), name: k("name"), email: k("email"), linkedin: k("linkedin"), details: k("details"), submit: k("submit"), success: k("success") }}
      />
    </section>
  );
}
