"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/roster", label: "Roster" },
  { href: "/games/new", label: "New Game" },
  { href: "/games", label: "Games" },
  { href: "/fairness", label: "Fairness" },
];

export function Nav() {
  const pathname = usePathname();

  // Hide nav on print pages
  if (pathname.endsWith("/print")) return null;

  return (
    <nav className="bg-white sticky top-0 z-50 border-b-[3px] border-b-red-600">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-lg flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-red-600 rotate-45 rounded-[1px]" />
            LineupIQ
          </Link>
          <div className="flex gap-1">
            {links.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
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
