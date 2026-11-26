/** Server-safe link helpers shared by the client grid and server pages. */
import Link from "next/link";
import type { Product } from "@founders/core/filters";
import type { LinkFn } from "@founders/ui";

export const PRODUCT_PATH: Record<Product, string> = {
  companies: "/companies",
  people: "/people",
  investors: "/investors",
  funding_rounds: "/funding-rounds",
  talent_signals: "/talent-signals",
  interest_signals: "/interest-signals",
  acquisitions: "/acquisitions",
  ipos: "/ipos",
  news_signals: "/news",
};

export const appLink: LinkFn = (kind, id, label) => {
  const href = kind === "company" ? `/companies/${id}` : kind === "person" ? `/people/${id}` : kind === "investor" ? `/investors/${id}` : "#";
  return (
    <Link href={href} className="hover:text-accent hover:underline">
      {label}
    </Link>
  );
};
