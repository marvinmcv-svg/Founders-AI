import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand } from "@founders/config";
import "./globals.css";
import { Header } from "@/components/chrome/Header";
import { Footer } from "@/components/chrome/Footer";
import { AnnouncementBar, CookieConsent, DemoPill } from "@/components/chrome/Client";
import { AnalyticsListener } from "@/components/chrome/Analytics";
import { t } from "@/lib/copy";
import { appUrl, integrationsMenu, platformMenu, resourcesMenu } from "@/lib/nav";
import { getStatVars } from "@/lib/stats";

export const metadata: Metadata = {
  metadataBase: new URL(brand.urls.www),
  title: { default: `${brand.name} — Private-markets intelligence`, template: `%s · ${brand.name}` },
  description: t("home.hero.sub"),
  icons: { icon: "/founders-mark.jpg" },
  openGraph: { siteName: brand.name, type: "website" },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${brand.urls.www}/#org`, name: brand.name, legalName: brand.legalEntity, url: brand.urls.www, logo: `${brand.urls.www}/founders-mark.jpg`, sameAs: [brand.social.instagram, brand.urls.academy].filter(Boolean), address: { "@type": "PostalAddress", addressLocality: "Santa Cruz de la Sierra", addressCountry: "BO" } },
    { "@type": "WebSite", "@id": `${brand.urls.www}/#website`, name: brand.name, url: brand.urls.www, publisher: { "@id": `${brand.urls.www}/#org` } },
    { "@type": "SoftwareApplication", name: brand.name, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: brand.urls.app, publisher: { "@id": `${brand.urls.www}/#org` } },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const vars = await getStatVars();
  const labels = {
    platform: t("global.nav.platform"),
    agents: t("global.nav.agents"),
    api: t("global.nav.api"),
    integrations: t("global.nav.integrations"),
    resources: t("global.nav.resources"),
    pricing: t("global.nav.pricing"),
    login: t("global.nav.login"),
    getStarted: t("global.nav.getStarted"),
    soon: t("global.nav.soon"),
    new: t("global.nav.new"),
  };
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
          Skip to content
        </a>
        <AnnouncementBar text={t("global.announcement.text")} cta={t("global.announcement.cta")} href="/platform#discovery" />
        <Header
          labels={labels}
          platform={platformMenu(vars)}
          integrations={integrationsMenu()}
          resources={resourcesMenu()}
          links={{ agents: "/agents", api: "/api", login: appUrl("/login"), signup: appUrl("/signup") }}
        />
        <main id="main">{children}</main>
        <Footer />
        <AnalyticsListener />
        <DemoPill cta={t("global.demoPill.cta")} bookedLabel={t("global.demoPill.bookedToday")} />
        <CookieConsent text={t("global.cookie.text")} accept={t("global.cookie.accept")} reject={t("global.cookie.reject")} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      </body>
    </html>
  );
}
