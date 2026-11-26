import type { Metadata } from "next";
import { GridPage, type GridSearchParams } from "@/components/grid/GridPage";

export const metadata: Metadata = { title: "IPOs" };

export default function Page({ searchParams }: { searchParams: GridSearchParams }) {
  return <GridPage product="ipos" searchParams={searchParams} />;
}
