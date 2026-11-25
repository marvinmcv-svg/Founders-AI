import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";

export const metadata: Metadata = { title: "Data processing addendum" };

export default function Page() {
  return <LegalDoc name="dpa" id="legal.dpa" />;
}
