"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import type { NavItem } from "@/lib/content/app-navigation";
import { AccountMenu } from "./account-menu";

/**
 * Shared authenticated shell for both actor types (ADR-009 §6).
 *
 * One shell, two navigation sets — the brief's "do not build separate
 * domain systems per role". The server decides which nav to pass in; this
 * component never reads a session or a capability itself, so it cannot
 * accidentally become an authorization surface.
 *
 * Client component only because it owns the mobile menu's open/closed
 * state and needs `usePathname` for the active item.
 */
export function AppShell({
  nav,
  displayName,
  roleLabel,
  areaLabel,
  logoutPath,
  notificationsHref,
  unreadCount,
  children,
}: {
  nav: NavItem[];
  displayName: string;
  roleLabel: string | null;
  areaLabel: string;
  logoutPath: string;
  notificationsHref?: string;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Longest-prefix match, so /staff/cases/123 highlights "Cases" and not
  // "Dashboard" (which would match every path under /staff).
  const activeHref = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <header className="border-navy-800 bg-navy-900 border-b">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-8">
              <Link
                href={nav[0]?.href ?? "/"}
                className="font-display shrink-0 text-lg font-semibold text-white transition-opacity hover:opacity-80"
              >
                Immigration Horizons
                <span className="text-navy-300 ml-2 font-sans text-xs font-medium tracking-wide uppercase">
                  {areaLabel}
                </span>
              </Link>

              <nav aria-label="Primary" className="hidden md:block">
                <ul className="flex items-center gap-1">
                  {nav.map((item) => {
                    const isActive = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-navy-800 text-white"
                              : "text-navy-200 hover:bg-navy-800/60 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            <div className="flex items-center gap-2">
              {notificationsHref ? (
                <Link
                  href={notificationsHref}
                  className="text-navy-200 hover:bg-navy-800/60 relative rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors hover:text-white"
                >
                  Notifications
                  {unreadCount && unreadCount > 0 ? (
                    <span className="bg-gold-500 text-navy-900 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Link>
              ) : null}

              <div className="hidden md:block">
                <AccountMenu displayName={displayName} roleLabel={roleLabel} logoutPath={logoutPath} />
              </div>

              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                aria-expanded={mobileOpen}
                aria-controls="app-mobile-nav"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                className="text-navy-200 hover:bg-navy-800/60 rounded-lg p-2 transition-colors hover:text-white md:hidden"
              >
                {mobileOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
              </button>
            </div>
          </div>

          {mobileOpen ? (
            <div id="app-mobile-nav" className="border-navy-800 border-t py-3 md:hidden">
              <nav aria-label="Primary (mobile)">
                <ul className="flex flex-col gap-1">
                  {nav.map((item) => {
                    const isActive = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={`block rounded-lg px-3 py-2.5 font-sans text-sm font-medium transition-colors ${
                            isActive ? "bg-navy-800 text-white" : "text-navy-200 hover:bg-navy-800/60"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="border-navy-800 mt-3 border-t pt-3">
                <AccountMenu
                  displayName={displayName}
                  roleLabel={roleLabel}
                  logoutPath={logoutPath}
                  alwaysExpanded
                />
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
