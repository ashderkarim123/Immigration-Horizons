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

export function Header() {
  const pathname = usePathname();
  const [openMega, setOpenMega] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The mobile drawer covers the page, so the page behind it must not scroll.
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
    <header
      className={cn(
        "sticky top-0 z-50 bg-white/90 backdrop-blur-md transition-shadow duration-300",
        scrolled ? "border-ink-200 border-b shadow-subtle" : "border-b border-transparent",
      )}
    >
      <a
        href="#main"
        className="focus:bg-navy-800 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-full focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <Container width="wide">
        <div className="flex h-20 items-center justify-between gap-6">
          <Link
            href="/"
            className="shrink-0"
            aria-label={`Immigration Horizons — home`}
          >
            <Image
              src="/images/logo-header.png"
              alt="Immigration Horizons"
              width={551}
              height={320}
              priority
              className="h-14 w-auto sm:h-16"
            />
          </Link>

          {/* `relative` anchors the mega panel to the nav block rather than to
              an individual trigger, so a wide panel can never overflow the
              viewport edge and introduce horizontal scroll. */}
          <div
            ref={navRef}
            className="relative hidden lg:flex lg:items-center lg:gap-1"
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

          <div className="hidden shrink-0 lg:block">
            <Button href="/consultation" variant="gold">
              Free Consultation
            </Button>
          </div>

          <button
            type="button"
            className="text-navy-800 hover:bg-navy-50 -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full lg:hidden"
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
    "relative rounded-full px-4 py-2 font-sans text-[0.9375rem] font-medium transition-colors duration-200";

  if (!item.mega) {
    return (
      <Link
        href={item.href}
        className={cn(
          base,
          active ? "text-navy-900" : "text-ink-600 hover:text-navy-800",
        )}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
        {active ? <ActiveUnderline /> : null}
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
          active || open ? "text-navy-900" : "text-ink-600 hover:text-navy-800",
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {item.label}
        <ChevronDown
          size={15}
          className={cn(
            "transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
        {active ? <ActiveUnderline /> : null}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="rounded-panel shadow-lifted border-ink-200 absolute top-full left-1/2 z-50 mt-2 w-[min(46rem,calc(100vw-3rem))] -translate-x-1/2 border bg-white p-2"
      >
        <div className="grid grid-cols-[1fr_1fr_0.9fr] gap-2">
          {item.mega.columns.map((column) => (
            <div key={column.heading} className="p-4">
              <p className="text-gold-700 mb-3 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
                {column.heading}
              </p>
              <ul className="flex flex-col gap-0.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:bg-navy-50 block rounded-lg px-3 py-2 transition-colors duration-150"
                    >
                      <span className="text-navy-800 block font-sans text-sm font-semibold">
                        {link.label}
                      </span>
                      {link.description ? (
                        <span className="text-ink-500 block font-sans text-xs">
                          {link.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="bg-navy-900 rounded-card flex flex-col gap-3 p-6">
            <p className="font-display text-lg font-semibold text-white">
              {item.mega.feature.heading}
            </p>
            <p className="text-navy-200 font-sans text-[0.8125rem] leading-relaxed">
              {item.mega.feature.body}
            </p>
            <Button
              href={item.mega.feature.ctaHref}
              variant="gold"
              size="sm"
              className="mt-auto"
            >
              {item.mega.feature.ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveUnderline() {
  return (
    <span
      aria-hidden
      className="bg-gold-500 absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full"
    />
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
      className="border-ink-200 h-[calc(100dvh-5rem)] overflow-y-auto border-t bg-white lg:hidden"
    >
      <Container className="py-6">
        <ul className="flex flex-col gap-1">
          {primaryNav.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-xl px-4 py-3 font-sans text-base font-semibold",
                  isActive(pathname, item.href)
                    ? "bg-navy-50 text-navy-900"
                    : "text-ink-700",
                )}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>

              {item.mega ? (
                <div className="mt-1 mb-2 ml-4 flex flex-col gap-4 border-l border-ink-200 pl-4">
                  {item.mega.columns.map((column) => (
                    <div key={column.heading}>
                      <p className="text-gold-700 mb-1.5 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
                        {column.heading}
                      </p>
                      <ul className="flex flex-col">
                        {column.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              onClick={onNavigate}
                              className="text-ink-600 block py-2 font-sans text-sm"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          href="/consultation"
          variant="gold"
          size="lg"
          block
          className="mt-6"
          onClick={onNavigate}
        >
          Free Consultation
        </Button>
      </Container>
    </div>
  );
}
