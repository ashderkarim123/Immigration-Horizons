/**
 * Analytics IDs, GA4 event vocabulary, and the one place that talks to the
 * browser's tracking objects.
 *
 * Params are deliberately coarse (form name, service, field *names*): never
 * pass a name, email, phone number or message text to Google. Page views,
 * scrolls, outbound clicks, file downloads and form-interaction starts are
 * already collected by GA4 Enhanced Measurement, so they are not re-sent here.
 */

/**
 * Both IDs are public by design (they ship in every page), so they default
 * here: the VPS builds from its own .env, and NEXT_PUBLIC_* is inlined at
 * build time. Set the env var to override; a value that is not a well-formed
 * ID (e.g. "off") disables that tag.
 */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "GTM-M9KC3GDW";
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-XYD4F5BE1F";

export type AnalyticsEvent =
  | "generate_lead" // a consultation or contact form was accepted by the server
  | "form_error" // a submission was rejected (validation / rate limit)
  | "click_whatsapp"
  | "click_email"
  | "click_phone"
  | "cta_consultation_click";

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "event", name: string, params?: Params) => void;
  }
}

/**
 * Pushes `{ event, ...params }` to the dataLayer (GTM custom-event triggers
 * listen for it) and, when the direct GA4 tag is loaded, sends the same event
 * through gtag. No-op on the server; never throws.
 */
export function trackEvent(name: AnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;
  (window.dataLayer ??= []).push({ event: name, ...params });
  window.gtag?.("event", name, params);
}

/** Which event, if any, a click on a link with this href should record. */
export function eventForHref(href: string): AnalyticsEvent | null {
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|wa\.link)\//i.test(href)) return "click_whatsapp";
  if (/^mailto:/i.test(href)) return "click_email";
  if (/^tel:/i.test(href)) return "click_phone";
  if (/^\/consultation(\/|\?|#|$)/.test(href)) return "cta_consultation_click";
  return null;
}
