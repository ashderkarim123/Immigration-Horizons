"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import type { NavItem } from "@/lib/content/app-navigation";
import { postPortalJson } from "@/lib/auth/portal-fetch";

/**
 * Account menu for the SaaS shell (ADR-009 §6, extended in ADR-011 §1).
 *
 * Shows who is signed in, links to their account pages, and signs them
 * out. The links are passed in by the layout, so this component never
 * decides which actor type it is serving — a client can only ever be given
 * client destinations.
 *
 * Sign-out POSTs (never a link) so it passes the same Origin check every
 * other mutating route uses and cannot be triggered by a crafted GET.
 */
export function AccountMenu({
  displayName,
  roleLabel,
  logoutPath,
  links = [],
  alwaysExpanded = false,
  onNavigate,
}: {
  displayName: string;
  roleLabel: string | null;
  logoutPath: string;
  links?: NavItem[];
  alwaysExpanded?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Close on outside click and on Escape — a menu that traps focus or
  // refuses to dismiss is worse than no menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setPending(true);
    const result = await postPortalJson(logoutPath, {});
    setPending(false);
    if (result.ok) {
      router.push(result.redirectTo ?? "/");
      router.refresh();
    }
  }

  const details = (
    <div className="flex flex-col gap-1">
      <div className="px-3 pb-2">
        <p className="truncate text-sm font-semibold text-white">{displayName}</p>
        {roleLabel ? <p className="text-navy-300 text-xs">{roleLabel}</p> : null}
      </div>

      {links.length > 0 ? (
        <ul className="border-navy-800 flex flex-col gap-0.5 border-t pt-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="text-navy-200 hover:bg-navy-800 block rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={links.length > 0 ? "border-navy-800 mt-1 border-t pt-2" : ""}>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending}
          className="text-navy-200 hover:bg-navy-800 w-full rounded-lg px-3 py-2 text-left font-sans text-sm font-medium transition-colors hover:text-white disabled:opacity-60"
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );

  if (alwaysExpanded) return <div>{details}</div>;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="text-navy-200 hover:bg-navy-800/60 flex items-center gap-2 rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors hover:text-white"
      >
        <span className="max-w-[12rem] truncate">{displayName}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="border-navy-800 bg-navy-900 absolute right-0 z-50 mt-2 w-60 rounded-xl border p-2 shadow-lg"
        >
          {details}
        </div>
      ) : null}
    </div>
  );
}
