import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Page() {
  return <LegalDoc name="privacy-policy" id="legal.privacy-policy" />;
}
