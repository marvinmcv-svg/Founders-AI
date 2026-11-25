import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function Page() {
  return <LegalDoc name="terms-conditions" id="legal.terms-conditions" />;
}
