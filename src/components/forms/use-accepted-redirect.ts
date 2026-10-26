"use client";

import { useEffect } from "react";

import type { FormState } from "@/app/(site)/consultation/actions";

// The only places a form may send the browser after the server accepts a submission. The server
// chooses the target; this list is a second lock so a malformed response can never become an open redirect.
const THANK_YOU_PATHS = new Set(["/contact/thank-you", "/consultation/thank-you"]);

/**
 * Follows the server's `redirectTo` after an accepted submission, once the lead event has been
 * queued: gtag sends it as a beacon, and a navigation in the same tick can cut it off.
 */
export function useAcceptedRedirect(state: FormState) {
  useEffect(() => {
    const target = state.redirectTo;
    if (state.status !== "success" || !state.accepted || !target || !THANK_YOU_PATHS.has(target)) return;
    const timer = setTimeout(() => window.location.assign(target), 400);
    return () => clearTimeout(timer);
  }, [state]);
}
