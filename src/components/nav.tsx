"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/roster", label: "Roster" },
  { href: "/games", label: "Games" },
  { href: "/fairness", label: "Fairness" },
];

function isLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  // /games should only match /games exactly or /games/log, /games/[id] — NOT /games/new
  if (href === "/games") {
    return (
      pathname === "/games" ||
      pathname === "/games/log" ||
      /^\/games\/[^/]+$/.test(pathname) && pathname !== "/games/new"
    );
  }
  // /games/new matches /games/new exactly
  if (href === "/games/new") return pathname === "/games/new";
  // Everything else: prefix match
  return pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();

  // Hide nav on print pages
  if (pathname.endsWith("/print")) return null;

  return (
    <nav className="bg-[#1E63E9] sticky top-0 z-50 shadow-md">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-12 sm:h-14">
          <Link href="/" className="font-bold text-base sm:text-lg flex items-center gap-1.5 shrink-0">
            <span
              className="inline-block w-3.5 h-3.5 bg-white"
              style={{ clipPath: "polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%)" }}
            />
            <span className="text-white">Lineup<span className="text-[#2F80FF]">IQ</span></span>
          </Link>
          <div className="flex gap-1 sm:gap-1.5">
            {links.map((link) => {
              const active = isLinkActive(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2.5 sm:px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap uppercase tracking-wide ${
                    active
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
