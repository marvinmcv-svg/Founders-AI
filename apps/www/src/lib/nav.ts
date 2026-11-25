import { brand } from "@founders/config";
import { t } from "./copy";

/** R2/R3 destinations render a "coming soon" page instead of 404 (plan Phase 1). */
export const soon = (slug: string) => `/soon/${slug}`;
export const appUrl = (path = "") => `${brand.urls.app}${path}`;

export type MenuItem = { title: string; desc: string; href: string; badge?: "new" | "soon" };
export type MenuGroup = { label: string; items: MenuItem[] };

export function platformMenu(vars: Record<string, string | number>) {
  const m = (k: string) => ({ title: t(`global.menu.platform.${k}.title`), desc: t(`global.menu.platform.${k}.desc`, vars) });
  return {
    overview: { ...m("overview"), href: "/platform" },
    groups: [
      {
        label: t("global.menu.platform.dataGroup"),
        items: [
          { ...m("companies"), href: "/companies" },
          { ...m("people"), href: "/people" },
          { ...m("investors"), href: "/investors" },
          { ...m("transactions"), href: "/transactions" },
        ],
      },
      {
        label: t("global.menu.platform.featuresGroup"),
        items: [
          { ...m("talent"), href: soon("talent-signals"), badge: "soon" as const },
          { ...m("interest"), href: soon("interest-signals"), badge: "soon" as const },
          { ...m("news"), href: soon("news"), badge: "soon" as const },
          { ...m("revenue"), href: soon("revenue-valuation"), badge: "soon" as const },
          { ...m("valuation"), href: soon("revenue-valuation"), badge: "soon" as const },
        ],
      },
    ] as MenuGroup[],
    promo: { title: t("global.menu.platform.promo.title"), desc: t("global.menu.platform.promo.desc"), cta: t("global.menu.platform.promo.cta"), href: "/companies#estimates" },
  };
}

export function integrationsMenu(): MenuGroup[] {
  const m = (k: string) => ({ title: t(`global.menu.integrations.${k}.title`), desc: t(`global.menu.integrations.${k}.desc`) });
  return [
    {
      label: t("global.menu.integrations.connectGroup"),
      items: [
        { ...m("all"), href: soon("integrations"), badge: "soon" },
        { ...m("crm"), href: soon("integrations"), badge: "soon" },
        { ...m("network"), href: soon("integrations"), badge: "soon" },
        { ...m("chrome"), href: soon("integrations"), badge: "soon" },
      ],
    },
    {
      label: t("global.menu.integrations.deliveryGroup"),
      items: [
        { ...m("api"), href: appUrl("/developers") },
        { ...m("bulk"), href: "/pricing#bulk" },
        { ...m("mcp"), href: soon("mcp"), badge: "soon" },
      ],
    },
  ];
}

export function resourcesMenu(): MenuGroup[] {
  const m = (k: string) => ({ title: t(`global.menu.resources.${k}.title`), desc: t(`global.menu.resources.${k}.desc`) });
  return [
    {
      label: t("global.menu.resources.readGroup"),
      items: [
        { ...m("blog"), href: soon("blog"), badge: "soon" },
        { ...m("insights"), href: soon("insights"), badge: "soon" },
        { ...m("academy"), href: brand.urls.academy },
      ],
    },
  ];
}
