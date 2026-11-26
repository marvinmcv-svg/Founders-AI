import type { Metadata } from "next";
import { Link2, PencilLine, Radio, Workflow } from "lucide-react";
import { Marquee } from "@founders/ui/motion";
import { Block, CardGrid, CtaBand, ProductHero, Split } from "@/components/sections/kit";
import { ToolCatalog } from "@/components/mocks/ai";
import { CopyUrl, McpClientSwitcher, PermissionDialogMock } from "@/components/mocks/ai-client";
import { t, tList } from "@/lib/copy";
import { appUrl } from "@/lib/nav";
import { getStatVars } from "@/lib/stats";

export const revalidate = 600;
export async function generateMetadata(): Promise<Metadata> {
  const vars = await getStatVars();
  return { title: t("mcpPage.meta.title"), description: t("mcpPage.meta.description", vars), alternates: { canonical: "/mcp" } };
}

export default async function Mcp() {
  const vars = await getStatVars();
  const url = appUrl("/mcp");
  return (
    <>
      <ProductHero id="mcp.hero" prefix="mcpPage.hero" vars={vars} secondary={{ label: t("mcpPage.connect.guide"), href: appUrl("/settings#mcp") }}>
        <div className="p-3">
          <McpClientSwitcher prompt={t("mcpPage.demo.prompt")} toolCalls={tList("mcpPage.demo.calls")} answer={tList("mcpPage.demo.answer")} server="founders-ai" />
        </div>
      </ProductHero>
      <Block id="mcp.why" prefix="mcpPage.why" vars={vars}>
        <Marquee speed={30} className="mb-8">
          {tList("mcpPage.why.ticker", vars).map((x) => (
            <span key={x} className="flex items-center gap-3 whitespace-nowrap pr-4 font-display text-[22px] text-ink">
              {x} <span className="text-accent">✳</span>
            </span>
          ))}
        </Marquee>
        <CardGrid prefix="mcpPage.why" vars={vars} icons={[<Radio key="a" size={16} />, <PencilLine key="b" size={16} />, <Workflow key="c" size={16} />, <Link2 key="d" size={16} />]} />
      </Block>
      <Block id="mcp.tools" prefix="mcpPage.tools" vars={vars}>
        <ToolCatalog />
      </Block>
      <Split id="mcp.workflows" prefix="mcpPage.workflows" vars={vars} bullets>
        <PermissionDialogMock title={t("mcpPage.workflows.permission.title")} tool="create_list" kind={t("mcpPage.workflows.permission.kind")} deny={t("mcpPage.workflows.permission.deny")} allow={t("mcpPage.workflows.permission.allow")} />
      </Split>
      <Block id="mcp.connect" prefix="mcpPage.connect" vars={vars}>
        <div className="mb-8 max-w-2xl">
          <CopyUrl url={url} copy={t("mcpPage.connect.copy")} copied={t("mcpPage.connect.copied")} />
        </div>
        <CardGrid prefix="mcpPage.connect" vars={vars} cols={3} />
      </Block>
      <Block id="mcp.usage" prefix="mcpPage.usage" vars={vars}>
        <CardGrid prefix="mcpPage.usage" vars={vars} cols={3} />
      </Block>
      <CtaBand id="mcp.closing" h2={t("mcpPage.closing.h2")} body={t("mcpPage.closing.body")} />
    </>
  );
}
