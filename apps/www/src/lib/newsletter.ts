import type { NewsletterCopy } from "@/components/blog/Newsletter";
import { t } from "./copy";

export function newsletterCopy(): NewsletterCopy {
  return {
    title: t("newsletter.title"),
    body: t("newsletter.body"),
    placeholder: t("newsletter.placeholder"),
    cta: t("newsletter.cta"),
    done: t("newsletter.done"),
    error: t("newsletter.error"),
  };
}
