"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { primaryNav, type NavItem } from "@/lib/content/navigation";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const CTA_LABEL = "Book a free consultation";

export function Header() {
  const pathname = usePathname();
  const [openMega, setOpenMega] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Any navigation dismisses whatever is open. Adjusting during render rather
  // than in an effect avoids a second paint with the menu still showing.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    setOpenMega(null);
    setMobileOpen(false);
  }

  // The mobile panel covers the page, so the page behind it must not scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMega(null);
      setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!openMega) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMega(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMega]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Hover-open is a convenience for mice only; touch and keyboard use the
  // button. The delay stops the panel flickering as the pointer crosses gaps.
  const hoverOpen = useCallback(
    (label: string) => {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
        return;
      cancelClose();
      setOpenMega(label);
    },
    [cancelClose],
  );

  const hoverClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenMega(null), 140);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <header className="border-navy-800/14 bg-ink-50/92 sticky top-0 z-50 border-b backdrop-blur-[10px]">
      <a
        href="#main"
        className="focus:bg-navy-800 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-full focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <Container width="wide">
        <div className="flex min-h-[72px] items-center justify-between gap-8 sm:min-h-[84px]">
          {/* The logo is the only accessible name this link has, so the
              `aria-label` is load-bearing. */}
          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label="Immigration Horizons — home"
          >
            <Image
              src="/images/open-horizons-horizontal-full.svg"
              alt="Immigration Horizons"
              width={1000}
              height={280}
              priority
              className="h-auto w-[200px] min-[400px]:w-[220px] lg:w-[280px]"
            />
          </Link>

          {/* `relative` anchors the mega panel to the nav block rather than to
              an individual trigger, so a wide panel can never overflow the
              viewport edge and introduce horizontal scroll. */}
          <div
            ref={navRef}
            className="relative ml-auto hidden xl:flex xl:items-center xl:gap-1"
          >
            {primaryNav.map((item) => (
              <DesktopNavItem
                key={item.label}
                item={item}
                pathname={pathname}
                open={openMega === item.label}
                onToggle={() =>
                  setOpenMega((current) =>
                    current === item.label ? null : item.label,
                  )
                }
                onHoverOpen={() => hoverOpen(item.label)}
                onHoverClose={hoverClose}
              />
            ))}
          </div>

          <div className="hidden shrink-0 xl:block">
            <Button href="/consultation" variant="primary">
              {CTA_LABEL}
            </Button>
          </div>

          <button
            type="button"
            className="border-navy-800/28 text-navy-800 inline-flex h-11 w-11 items-center justify-center rounded-xl border xl:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </Container>

      <MobileNav
        open={mobileOpen}
        pathname={pathname}
        onNavigate={() => setMobileOpen(false)}
      />
    </header>
  );
}

function DesktopNavItem({
  item,
  pathname,
  open,
  onToggle,
  onHoverOpen,
  onHoverClose,
}: {
  item: NavItem;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onHoverOpen: () => void;
  onHoverClose: () => void;
}) {
  const active = isActive(pathname, item.href);
  const base =
    "rounded-full px-3.5 py-2.5 font-sans text-[0.9375rem] font-medium transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800";

  if (!item.mega) {
    return (
      <Link
        href={item.href}
        className={cn(base, active ? "text-navy-800 font-semibold" : "text-ink-700")}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
      </Link>
    );
  }

  const panelId = `mega-${item.href.replace(/\W+/g, "")}`;

  return (
    <div onPointerEnter={onHoverOpen} onPointerLeave={onHoverClose}>
      <button
        type="button"
        className={cn(
          base,
          "inline-flex items-center gap-1.5",
          active ? "text-navy-800 font-semibold" : "text-ink-700",
          open && "bg-navy-50 text-navy-800",
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {item.label}
        <ChevronDown
          size={14}
          className={cn("transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="rounded-panel shadow-lifted border-navy-800/14 absolute top-full left-1/2 z-50 mt-2 w-[min(65rem,calc(100vw-3rem))] -translate-x-1/2 border bg-white p-8"
      >
        <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr_1fr] gap-8">
          {item.mega.columns.map((column) => (
            <div key={column.heading}>
              <p className={cn("mb-3 font-sans text-xs font-bold tracking-[0.12em] uppercase", column.tier === "secondary" ? "text-ink-600" : "text-gold-700")}>
                {column.heading}
              </p>
              <ul className="flex flex-col">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:bg-ink-50 -mx-2.5 block rounded-lg px-2.5 py-2 transition-colors duration-150"
                    >
                      <span className={cn("block font-sans text-[0.9375rem]", column.tier === "secondary" ? "text-ink-700 font-medium" : "text-navy-800 font-semibold")}>
                        {link.label}
                      </span>
                      {link.description ? (
                        <span className="text-ink-600 block font-sans text-[0.8125rem]">
                          {link.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="bg-navy-950 rounded-card flex flex-col gap-3 p-6">
            <p className="text-gold-200 font-sans text-xs font-bold tracking-[0.12em] uppercase">
              Free consultation
            </p>
            <p className="font-display text-xl text-white">
              {item.mega.feature.heading}
            </p>
            <p className="text-ink-50/85 font-sans text-[0.875rem] leading-relaxed">
              {item.mega.feature.body}
            </p>
            <Button
              href={item.mega.feature.ctaHref}
              variant="onDark"
              size="sm"
              className="mt-auto px-3 whitespace-nowrap"
            >
              {item.mega.feature.ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileNav({
  open,
  pathname,
  onNavigate,
}: {
  open: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div
      id="mobile-nav"
      hidden={!open}
      className="border-navy-800/14 bg-ink-50 h-[calc(100dvh-72px)] overflow-y-auto border-t xl:hidden"
    >
      <Container className="py-4">
        <ul className="flex flex-col">
          {primaryNav.map((item) => (
            <li key={item.label} className="border-navy-800/14 border-b">
              <Link
                href={item.href}
                onClick={onNavigate}
                className="text-navy-800 block py-3.5 font-sans text-[1.0625rem] font-semibold"
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>

              {item.mega ? (
                <div className="flex flex-col gap-3 pb-3">
                  {item.mega.columns.map((column) => (
                    <div key={column.heading}>
                      <p className={cn("mb-1 font-sans text-xs font-bold tracking-[0.12em] uppercase", column.tier === "secondary" ? "text-ink-600" : "text-gold-700")}>
                        {column.heading}
                      </p>
                      {column.tier === "secondary" ? (
                        <p className="flex flex-wrap gap-x-3 gap-y-1">
                          {column.links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={onNavigate}
                              className="text-ink-600 py-1 font-sans text-[0.9375rem]"
                            >
                              {link.label}
                            </Link>
                          ))}
                        </p>
                      ) : (
                        <ul className="flex flex-col">
                          {column.links.map((link) => (
                            <li key={link.href}>
                              <Link
                                href={link.href}
                                onClick={onNavigate}
                                className="text-ink-700 block py-2 font-sans text-[0.9375rem]"
                              >
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          href="/consultation"
          variant="primary"
          size="lg"
          block
          className="mt-5"
          onClick={onNavigate}
        >
          {CTA_LABEL}
        </Button>
      </Container>
    </div>
  );
}
