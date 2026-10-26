"use client";

import { useEffect } from "react";

import { eventForHref, linkTypeForEvent, pageTypeForPath, trackEvent } from "@/lib/analytics";

/**
 * Where on the page a link sits. An explicit `data-cta-placement` wins; otherwise
 * the surrounding landmark decides. Only the placement NAME is sent, never the
 * link's text, destination or any other content (a link label can be a phone
 * number or an email address). Values outside the analytics allowlist are dropped.
 */
function placementOf(anchor: Element): string {
  const explicit = anchor.closest("[data-cta-placement]")?.getAttribute("data-cta-placement");
  if (explicit) return explicit;
  if (anchor.closest("header")) return "header";
  if (anchor.closest("footer")) return "footer";
  return "content";
}

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
      const linkType = linkTypeForEvent(name);
      trackEvent(name, {
        page_type: pageTypeForPath(window.location.pathname),
        cta_placement: placementOf(anchor),
        ...(linkType ? { link_type: linkType } : {}),
        ...(name === "cta_consultation_click" ? { cta_id: anchor.closest("[data-cta-id]")?.getAttribute("data-cta-id") ?? "free_consultation" } : {}),
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
