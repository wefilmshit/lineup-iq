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
    <nav className="bg-white sticky top-0 z-50 border-b-[3px] border-b-[#0a6ff2]">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-12 sm:h-14">
          <Link href="/" className="font-bold text-base sm:text-lg flex items-center gap-1.5 shrink-0">
            <span
              className="inline-block w-3 h-3 bg-black"
              style={{ clipPath: "polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%)" }}
            />
            <span className="hidden sm:inline">Lineup<span className="text-[#0a6ff2]">IQ</span></span>
            <span className="sm:hidden">L<span className="text-[#0a6ff2]">IQ</span></span>
          </Link>
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = isLinkActive(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap uppercase ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
