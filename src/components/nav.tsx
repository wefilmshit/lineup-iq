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
  if (href === "/games") {
    return (
      pathname === "/games" ||
      pathname === "/games/log" ||
      /^\/games\/[^/]+$/.test(pathname) && pathname !== "/games/new"
    );
  }
  if (href === "/games/new") return pathname === "/games/new";
  return pathname.startsWith(href);
}

// ─── Tab Icons ──────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1E63E9" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function RosterIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1E63E9" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GamesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1E63E9" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function FairnessIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1E63E9" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

const tabIcons: Record<string, React.FC<{ active: boolean }>> = {
  "/": HomeIcon,
  "/roster": RosterIcon,
  "/games": GamesIcon,
  "/fairness": FairnessIcon,
};

// ─── Navigation ─────────────────────────────────────────

export function Nav() {
  const pathname = usePathname();

  // Hide nav on print pages
  if (pathname.endsWith("/print")) return null;

  return (
    <>
      {/* ─── Top Bar ──────────────────────────────── */}
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
            {/* Desktop nav links — hidden on mobile */}
            <div className="hidden md:flex gap-1.5">
              {links.map((link) => {
                const active = isLinkActive(link.href, pathname);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap uppercase tracking-wide ${
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

      {/* ─── Mobile Bottom Tab Bar ────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E6ECF5] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-stretch justify-around h-[66px] max-w-lg mx-auto">
          {links.map((link) => {
            const active = isLinkActive(link.href, pathname);
            const Icon = tabIcons[link.href];
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-[44px] min-h-[44px] transition-colors ${
                  active ? "text-[#1E63E9]" : "text-[#6B7280]"
                }`}
              >
                {Icon && <Icon active={active} />}
                <span className={`text-[11px] font-medium leading-none ${active ? "text-[#1E63E9]" : "text-[#6B7280]"}`}>
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Safe area for devices with home indicator */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  );
}
