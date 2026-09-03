"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Seven destinations don't fit a phone, so the nav scrolls horizontally with
 * the current page marked. The scrollbar is hidden but the row stays keyboard
 * and touch scrollable.
 */
const LINKS = [
  { href: "/", label: "League" },
  { href: "/lineup", label: "Lineup" },
  { href: "/waivers", label: "Waivers" },
  { href: "/streaming", label: "Streaming" },
  { href: "/chat", label: "Chat" },
  { href: "/model", label: "Model" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="-mx-1 flex gap-0.5 overflow-x-auto px-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              active
                ? "bg-white/[0.07] font-medium text-white"
                : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
