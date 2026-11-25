import type { Metadata } from "next";
import { GridPage, type GridSearchParams } from "@/components/grid/GridPage";

export const metadata: Metadata = { title: "Investors" };

export default function Page({ searchParams }: { searchParams: GridSearchParams }) {
  return <GridPage product="investors" searchParams={searchParams} />;
}
