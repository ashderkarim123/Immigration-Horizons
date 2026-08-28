import { notFound } from "next/navigation";

/**
 * Catch-all for unmatched `/portal/**` paths (ADR-008 §3).
 *
 * A route-group `not-found.tsx` only handles `notFound()` raised *inside*
 * that group — a genuinely unmatched URL falls through to the root
 * `not-found.tsx`, which is marketing copy (service cards, WhatsApp, "book
 * a consultation"). Calling `notFound()` from here puts unmatched portal
 * URLs back inside the group so `(app)/not-found.tsx` handles them.
 *
 * Next resolves more specific segments first, so this never shadows a real
 * portal route; it only catches what would otherwise have missed.
 */
export default function PortalCatchAll(): never {
  notFound();
}
