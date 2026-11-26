import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as repo from "@founders/core/repo";
import { GridPage, type GridSearchParams } from "@/components/grid/GridPage";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Interest Signals" };

/** Interest Signals grid (plan 7.3) — only for workspaces with the `interest_signals` flag (H8). */
export default async function Page({ searchParams }: { searchParams: GridSearchParams }) {
  const ctx = await getCtx();
  if (!(await repo.isFlagOn("interest_signals", ctx.orgId))) notFound();
  return <GridPage product="interest_signals" searchParams={searchParams} />;
}
