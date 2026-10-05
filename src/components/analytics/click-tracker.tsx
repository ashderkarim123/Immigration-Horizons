"use client";

import { useEffect } from "react";

import { eventForHref, trackEvent } from "@/lib/analytics";

/**
 * One delegated listener records WhatsApp / email / phone / consultation-CTA
 * clicks site-wide, so no link needs its own handler and new links are
 * tracked automatically. Renders nothing.
 */
export function ClickTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      const name = anchor && eventForHref(anchor.getAttribute("href") ?? "");
      if (!anchor || !name) return;
      trackEvent(name);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
