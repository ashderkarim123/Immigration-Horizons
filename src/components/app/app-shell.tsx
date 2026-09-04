"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  ContactRound,
  Gauge,
  LayoutDashboard,
  Menu,
  Network,
  X,
} from "lucide-react";

import type { NavItem } from "@/lib/content/app-navigation";
import { AccountMenu } from "./account-menu";

const navIcons = {
  Dashboard: LayoutDashboard,
  Operations: Gauge,
  Cases: BriefcaseBusiness,
  Clients: ContactRound,
  Consultations: CalendarDays,
  Questions: CircleHelp,
  Queries: Network,
  Tasks: ClipboardCheck,
} as const;

/**
 * Shared authenticated shell for both actor types (ADR-009 §6, extended in
 * ADR-011 §1).
 *
 * One shell, two navigation sets — the brief's "do not build separate
 * domain systems per role". The server decides which nav and which account
 * links to pass in; this component never reads a session or a capability
 * itself, so it cannot accidentally become an authorization surface.
 *
 * Client component only because it owns the mobile menu's open/closed
 * state and needs `usePathname` for the active item.
 */
export function AppShell({
  nav,
  accountLinks,
  displayName,
  roleLabel,
  areaLabel,
  homeHref,
  logoutPath,
  notificationsHref,
  unreadCount,
  children,
}: {
  nav: NavItem[];
  accountLinks?: NavItem[];
  displayName: string;
  roleLabel: string | null;
  areaLabel: string;
  homeHref?: string;
  logoutPath: string;
  notificationsHref?: string;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Longest-prefix match, so /staff/cases/123 highlights "Cases" and not
  // "Dashboard" (which would match every path under /staff).
  const activeHref = [...nav, ...(accountLinks ?? [])]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const unread = unreadCount ?? 0;
  const hasUnread = unread > 0;
  const unreadLabel = hasUnread
    ? `Notifications, ${unread} unread`
    : "Notifications, none unread";

  return (
    <>
      <a
        href="#main"
        className="focus:bg-gold-500 focus:text-navy-900 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      <header className="bg-navy-950 sticky top-0 z-50 border-b border-white/10 shadow-[0_12px_36px_rgba(8,19,42,0.16)]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="bg-gold-500/10 absolute -top-24 left-1/4 h-44 w-44 rounded-full blur-3xl" />
          <div className="bg-navy-500/20 absolute -right-10 -bottom-28 h-52 w-52 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
          <div className="flex min-h-20 items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center">
              <Link
                href={homeHref ?? nav[0]?.href ?? "/"}
                className="group flex min-w-0 shrink-0 items-center gap-3"
                aria-label={`Immigration Horizons ${areaLabel} home`}
              >
                <span className="flex h-12 w-[5.15rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white px-2 shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-transform duration-300 ease-(--ease-out-soft) motion-safe:group-hover:-translate-y-0.5">
                  <Image
                    src="/images/logo-header.png"
                    alt=""
                    width={551}
                    height={320}
                    priority
                    className="h-auto w-full"
                  />
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="font-display block truncate text-lg leading-tight font-semibold text-white">
                    Immigration Horizons
                  </span>
                  <span className="text-gold-300 mt-1 block font-sans text-[0.66rem] font-bold tracking-[0.18em] uppercase">
                    {areaLabel}
                  </span>
                </span>
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {notificationsHref ? (
                <Link
                  href={notificationsHref}
                  aria-label={unreadLabel}
                  title="Notifications"
                  className="text-navy-200 hover:bg-navy-800/60 relative rounded-lg p-2.5 transition-colors hover:text-white"
                >
                  <Bell size={19} strokeWidth={1.75} aria-hidden />
                  {hasUnread ? (
                    <span
                      aria-hidden
                      className="bg-gold-500 text-navy-900 absolute -top-0.5 -right-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-bold tabular-nums"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              ) : null}

              <div className="hidden md:block">
                <AccountMenu
                  displayName={displayName}
                  roleLabel={roleLabel}
                  logoutPath={logoutPath}
                  links={accountLinks}
                />
              </div>

              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                aria-expanded={mobileOpen}
                aria-controls="app-mobile-nav"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                className="text-navy-200 hover:bg-white/10 rounded-xl border border-white/10 p-2.5 transition-colors hover:text-white md:hidden"
              >
                {mobileOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
              </button>
            </div>
          </div>

          <nav aria-label="Primary" className="hidden border-t border-white/10 md:block">
            <ul className="flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nav.map((item) => {
                const isActive = item.href === activeHref;
                const Icon = navIcons[item.label as keyof typeof navIcons] ?? LayoutDashboard;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`group relative flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-sans text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? "bg-white text-navy-900 shadow-subtle"
                          : "text-navy-200 hover:bg-white/8 hover:text-white"
                      }`}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden
                        className={isActive ? "text-gold-600" : "text-navy-300 group-hover:text-gold-300"}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {mobileOpen ? (
            <div id="app-mobile-nav" className="border-t border-white/10 py-4 md:hidden">
              <nav aria-label="Primary (mobile)">
                <ul className="flex flex-col gap-1">
                  {nav.map((item) => {
                    const isActive = item.href === activeHref;
                    const Icon = navIcons[item.label as keyof typeof navIcons] ?? LayoutDashboard;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-xl px-3 py-3 font-sans text-sm font-medium transition-colors ${
                            isActive ? "bg-white text-navy-900" : "text-navy-200 hover:bg-white/8"
                          }`}
                        >
                          <Icon size={17} strokeWidth={1.8} aria-hidden className={isActive ? "text-gold-600" : "text-navy-300"} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="mt-3 border-t border-white/10 pt-3">
                <AccountMenu
                  displayName={displayName}
                  roleLabel={roleLabel}
                  logoutPath={logoutPath}
                  links={accountLinks}
                  alwaysExpanded
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main id="main" className="ih-app-canvas flex-1">
        {children}
      </main>
    </>
  );
}
