import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand } from "@founders/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  icons: { icon: "/founders-mark.jpg" },
  robots: { index: false },
};
export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas">{children}</body>
    </html>
  );
}
