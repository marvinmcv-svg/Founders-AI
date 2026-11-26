import type { Metadata } from "next";
import { GridPage, type GridSearchParams } from "@/components/grid/GridPage";

export const metadata: Metadata = { title: "Acquisitions" };

export default function Page({ searchParams }: { searchParams: GridSearchParams }) {
  return <GridPage product="acquisitions" searchParams={searchParams} />;
}
