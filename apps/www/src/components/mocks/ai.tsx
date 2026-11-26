/** Server mocks for the Agents and MCP pages. Text comes from copy keys; tool names mirror apps/mcp. */
import { Bot, CheckCircle2, Search } from "lucide-react";
import { AppWindow, Badge, cn, LogoMark } from "@founders/ui";
import { t, tList, tObjects } from "@/lib/copy";

export function AgentMock({ className }: { className?: string }) {
  const threads = tList("agents.demo.threads");
  return (
    <AppWindow className={className} title="app · Agent" sidebar={false}>
      <div aria-hidden className="grid min-h-[420px] md:grid-cols-[200px_1fr]">
        <div className="hidden flex-col gap-1 border-r border-line p-3 text-[12px] md:flex">
          {tList("agents.demo.sidebar").map((g, i) => (
            <div key={g} className="mb-2">
              <p className="px-2 pb-1 text-[10.5px] uppercase tracking-[0.12em] text-faint">{g}</p>
              <p className={cn("truncate rounded-md px-2 py-1.5", i === 0 ? "bg-white/[0.07] text-ink" : "text-muted")}>{threads[i]}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 p-5 text-[13px]">
          <div className="ml-auto rounded-[14px] rounded-br-sm bg-accent/15 px-3.5 py-2 font-mono text-[12.5px] text-ink">{t("agents.demo.prompt")}</div>
          <div className="flex items-start gap-3">
            <LogoMark size={26} />
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {tList("agents.demo.steps").map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-1 text-[11.5px] text-muted">
                    <CheckCircle2 size={12} className="text-positive" /> {s}
                  </span>
                ))}
              </div>
              {tList("agents.demo.answer").map((a) => (
                <p key={a} className="text-text">
                  {a}
                </p>
              ))}
              <Badge tone="neutral" className="w-fit">
                {t("agents.demo.sources")}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

export function SkillLibraryMock({ className }: { className?: string }) {
  const items = tObjects<{ slug: string; desc: string }>("agents.skills.library");
  return (
    <div aria-hidden className={cn("rounded-[18px] border border-line bg-paper p-5", className)}>
      <p className="mb-3 flex items-center gap-2 text-[13px] text-ink">
        <Bot size={15} className="text-accent" /> {t("agents.skills.libraryTitle")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((s) => (
          <div key={s.slug} className="rounded-[12px] border border-line bg-raised px-3.5 py-3">
            <p className="font-mono text-[13px] text-accent">{s.slug}</p>
            <p className="mt-1 text-[12.5px] text-muted">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The 29 MCP tools by group (mirrors apps/mcp/src/tools.ts; free = never billed). */
export const MCP_GROUPS: { key: string; tools: string[] }[] = [
  { key: "resolve", tools: ["find_company", "find_person", "find_investor", "search"] },
  {
    key: "company",
    tools: ["get_company_profile", "get_company_competitors", "get_company_funding", "get_company_revenue", "get_company_valuation", "get_company_news", "get_company_investor_interest", "get_company_people", "get_company_traction", "get_company_transactions"],
  },
  { key: "people", tools: ["get_person_profile", "get_person_email", "get_person_talent_signals"] },
  { key: "investors", tools: ["get_investor_profile", "get_investor_rounds", "get_investor_interest_signals"] },
  { key: "lists", tools: ["get_lists", "get_list_items", "create_list", "add_to_list", "remove_from_list"] },
  { key: "searches", tools: ["get_saved_searches", "get_saved_search_items", "create_saved_search", "update_saved_search"] },
];
const FREE = new Set(["find_company", "find_person", "find_investor", "get_lists", "get_saved_searches", "create_list", "add_to_list", "remove_from_list", "create_saved_search", "update_saved_search"]);

export function ToolCatalog() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {MCP_GROUPS.map((g) => (
        <div key={g.key} className="rounded-[20px] border border-line bg-paper p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[19px] font-semibold tracking-[-0.02em]">{t(`mcpPage.tools.groups.${g.key}`)}</h3>
            <span className="font-display text-[13px] text-faint">{g.tools.length}</span>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            {g.tools.map((tool) => (
              <span key={tool} className="flex items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-1.5 font-mono text-[12px] text-text">
                <Search size={11} className="text-faint" />
                {tool}
                {FREE.has(tool) ? <span className="ml-auto rounded bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">{t("mcpPage.tools.free")}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
