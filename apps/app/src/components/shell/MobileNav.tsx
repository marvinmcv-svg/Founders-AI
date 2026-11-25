"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { LogoMark } from "@founders/ui";

/** < 1024px: collapsed sidebar → top bar + sheet (plan 7.1b responsive policy). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [
    ["Company DB", "/companies"],
    ["People DB", "/people"],
    ["Talent Signals", "/talent-signals"],
    ["Investor DB", "/investors"],
    ["Funding Rounds", "/funding-rounds"],
    ["Lists", "/lists"],
    ["Searches", "/searches"],
    ["Settings", "/settings"],
  ];
  return (
    <div className="flex h-12 items-center gap-3 border-b border-line px-4 lg:hidden">
      <button aria-label="Menu" onClick={() => setOpen(true)}>
        <Menu size={20} />
      </button>
      <LogoMark size={22} />
      <button aria-label="Search" className="ml-auto" onClick={() => window.dispatchEvent(new Event("fai:cmdk"))}>
        <Search size={18} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-canvas p-4">
          <button aria-label="Close" onClick={() => setOpen(false)} className="mb-4">
            <X size={22} />
          </button>
          {links.map(([l, h]) => (
            <Link key={h} href={h} onClick={() => setOpen(false)} className="block border-b border-line py-3 font-display text-[18px]">
              {l}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
