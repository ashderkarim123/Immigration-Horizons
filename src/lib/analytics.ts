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

/** Keep the current direct GA4 setup until the GTM Google tag is verified. */
export function analyticsTransport(value = process.env.NEXT_PUBLIC_GA_TRANSPORT): "direct" | "gtm" | "off" {
  if (value === undefined || value === "" || value === "direct") return "direct";
  if (value === "gtm") return "gtm";
  return "off"; // Unknown values fail closed rather than counting hits twice.
}

const services = new Set(["EB-2 NIW", "EB-1A", "EB-1B", "EB-1C", "O-1", "O-1 Visa",
  "RFE & NOID Responses", "Recommendation Letters", "Expert Opinion Letters",
  "Business & Personal Plans", "Evidence Review & Packaging", "Immigration Consultation"]);

/** Only categorical form information is allowed through the event boundary. */
export function analyticsParams(params: Params): Params {
  const result: Params = {};
  if (params.form_name === "contact" || params.form_name === "consultation") result.form_name = params.form_name;
  if (typeof params.service === "string" && services.has(params.service)) result.service = params.service;
  if (typeof params.error_fields === "string") {
    const fields = params.error_fields.split(",").filter((field) => ["name", "email", "phone", "service", "message", "consent", "none"].includes(field));
    if (fields.length) result.error_fields = fields.join(",");
  }
  return result;
}

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
 * Sends each event through ONE selected transport. GTM mode needs a published
 * Google tag and Custom Event triggers; direct mode owns GA4 in code and must
 * not also configure GA4 event tags in GTM. No-op on the server.
 */
export function trackEvent(name: AnalyticsEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;
  try {
    const transport = analyticsTransport();
    const safe = analyticsParams(params);
    if (transport === "gtm") (window.dataLayer ??= []).push({ ...safe, event: name });
    if (transport === "direct") {
      // Queue early clicks/form outcomes even before Next's afterInteractive
      // initializer runs. gtag uses Arguments objects in the same dataLayer.
      const gtag = window.gtag ??= function (command, event, values) {
        void command; void event; void values;
        // gtag's command queue uses Arguments objects, distinct from GTM events.
        // eslint-disable-next-line prefer-rest-params
        (window.dataLayer ??= []).push(arguments);
      };
      gtag("event", name, safe);
    }
  } catch {
    // Tracking failures must never break contact links or accepted lead forms.
  }
}

/** Which event, if any, a click on a link with this href should record. */
export function eventForHref(href: string): AnalyticsEvent | null {
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|wa\.link)\//i.test(href)) return "click_whatsapp";
  if (/^mailto:/i.test(href)) return "click_email";
  if (/^tel:/i.test(href)) return "click_phone";
  if (/^\/consultation(\/|\?|#|$)/.test(href)) return "cta_consultation_click";
  return null;
}
