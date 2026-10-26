/**
 * Campaign attribution that travels with a lead form: UTM parameters and ad
 * click ids. Shared by the consultation page, the contact form and both server
 * actions so the allowlist and the clean-up rules exist exactly once.
 *
 * These values come from a URL anyone can craft, so each one is length-limited
 * and stripped of control characters before it is stored. Nothing here reads or
 * writes browser storage: it only reads the page's own query string, and the
 * values go to the server with the form (Phase 16, Gate C).
 */
export const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;

export type TrackingParams = Partial<Record<(typeof TRACKING_KEYS)[number], string>>;

const MAX_LENGTH = 150;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_LENGTH) : "";
}

/** Keeps only the allowlisted keys that have a non-empty cleaned value. */
export function sanitizeTracking(source: (key: string) => unknown): TrackingParams {
  const out: TrackingParams = {};
  for (const key of TRACKING_KEYS) {
    const value = clean(source(key));
    if (value) out[key] = value;
  }
  return out;
}

/** From a query string such as `window.location.search`. */
export function trackingFromSearch(search: string): TrackingParams {
  const params = new URLSearchParams(search);
  return sanitizeTracking((key) => params.get(key));
}

/** From a submitted form. */
export function trackingFromForm(formData: FormData): TrackingParams {
  return sanitizeTracking((key) => formData.get(key));
}
