import type { Metadata } from "next";
import { GridPage, type GridSearchParams } from "@/components/grid/GridPage";

export const metadata: Metadata = { title: "People" };

export default function Page({ searchParams }: { searchParams: GridSearchParams }) {
  return <GridPage product="people" searchParams={searchParams} />;
}
