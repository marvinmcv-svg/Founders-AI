import Link from "next/link";
import { buttonClass } from "@founders/ui";
import { t } from "@/lib/copy";

export default function NotFound() {
  return (
    <section data-section="404.main" className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-5 py-32 text-center">
      <p className="font-display text-[96px] font-semibold leading-none text-accent">404</p>
      <h1 className="text-[36px] font-semibold">{t("notFound.h1")}</h1>
      <p className="text-muted">{t("notFound.body")}</p>
      <Link href="/" className={buttonClass("primary")}>
        {t("notFound.cta")}
      </Link>
    </section>
  );
}
