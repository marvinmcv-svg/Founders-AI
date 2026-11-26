import Link from "next/link";
import { brand } from "@founders/config";
import { Wordmark } from "@founders/ui";
import { t } from "@/lib/copy";
import { appUrl, soon } from "@/lib/nav";
import { CookieSettingsLink } from "./Client";

export function Footer() {
  const L = (k: string) => t(`global.footer.links.${k}`);
  const P = (k: string) => t(`global.menu.platform.${k}.title`);
  const I = (k: string) => t(`global.menu.integrations.${k}.title`);
  const cols: { title: string; links: [string, string][] }[] = [
    { title: t("global.footer.cols.data"), links: [[P("companies"), "/companies"], [P("people"), "/people"], [P("investors"), "/investors"], [P("transactions"), "/transactions"]] },
    { title: t("global.footer.cols.features"), links: [[P("talent"), soon("talent-signals")], [P("news"), soon("news")], [P("revenue"), soon("revenue-valuation")], [P("valuation"), soon("revenue-valuation")], [t("global.nav.agents"), soon("agents")]] },
    { title: t("global.footer.cols.integrations"), links: [[I("crm"), soon("integrations")], [I("network"), soon("integrations")], [I("chrome"), soon("integrations")]] },
    { title: t("global.footer.cols.delivery"), links: [[I("api"), appUrl("/developers")], [I("mcp"), soon("mcp")], [I("bulk"), "/pricing#bulk"]] },
    { title: t("global.footer.cols.company"), links: [[t("global.footer.program"), "https://foundersscz.com"], [L("partners"), "/partners"], [L("contact"), "/contact"], [L("careers"), soon("careers")], [L("blog"), soon("blog")], [t("global.menu.resources.academy.title"), brand.urls.academy]] },
    { title: t("global.footer.cols.legal"), links: [[L("privacy"), "/privacy-policy"], [L("privacyRights"), "/privacy-rights"], [L("terms"), "/terms-conditions"], [L("dpa"), "/dpa"], [L("optOut"), "/privacy-rights?type=DELETE"]] },
  ];
  const prompt = encodeURIComponent(t("global.footer.askAiPrompt", { url: brand.urls.www }));
  const ai: [string, string][] = [
    ["ChatGPT", `https://chatgpt.com/?prompt=${prompt}`],
    ["Perplexity", `https://www.perplexity.ai/search/new?q=${prompt}`],
    ["Grok", `https://x.com/i/grok?text=${prompt}`],
    ["Claude", `https://claude.ai/new?q=${prompt}`],
    ["Google AI Mode", `https://www.google.com/search?udm=50&aep=11&q=${prompt}`],
  ];
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 md:grid-cols-[1.3fr_repeat(6,1fr)]">
        <div className="flex flex-col gap-4">
          <Wordmark />
          <p className="max-w-[240px] text-[13px] text-muted">{t("global.footer.tagline")}</p>
          <p className="max-w-[240px] font-serif text-[16px] italic text-accent">{t("global.footer.mission")}</p>
          <a href={brand.social.instagram} className="text-[13px] text-muted hover:text-ink" rel="noopener noreferrer" target="_blank">
            Instagram · @founders.scz
          </a>
        </div>
        {cols.map((c) => (
          <div key={c.title} className="flex flex-col gap-2">
            <p className="text-[12px] uppercase tracking-[0.12em] text-faint">{c.title}</p>
            {c.links.map(([label, href]) =>
              href.startsWith("http") ? (
                <a key={label} href={href} className="text-[13px] text-muted hover:text-ink">
                  {label}
                </a>
              ) : (
                <Link key={label} href={href} className="text-[13px] text-muted hover:text-ink">
                  {label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 border-t border-line px-5 py-6 text-[13px] text-muted md:flex-row md:items-center">
        <span className="text-faint">{t("global.footer.askAi")}</span>
        <div className="flex flex-wrap gap-2">
          {ai.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-3 py-1 text-[12px] hover:border-accent/50 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-4 md:ml-auto">
          <CookieSettingsLink label={L("cookies")} />
          <span>
            © {new Date().getFullYear()} {brand.legalEntity}. {t("global.footer.rights")}
          </span>
        </div>
      </div>
    </footer>
  );
}
