"use client";

import { useEffect, useRef } from "react";

import { formOutcomeEvent, pageTypeForPath, trackEvent } from "@/lib/analytics";
import type { FormState } from "@/app/(site)/consultation/actions";

type FormName = "consultation" | "contact";

/** The visitor pressed submit. Not a lead: the server may still reject it. */
export function trackFormAttempt(formName: FormName) {
  trackEvent("lead_form_submit_attempt", { form_name: formName, page_type: pageTypeForPath(window.location.pathname) });
}

/**
 * Reports a form outcome to GA4 once per server response: `generate_lead` only
 * when the server marked the enquiry accepted, `form_error` (with the field
 * NAMES that failed, never values) on rejection. A honeypot "success" is not
 * accepted, so a bot is never counted. `getParams` is read at report time so it
 * can close over a ref.
 */
export function useFormTracking(formName: FormName, state: FormState, getParams?: () => Record<string, string>) {
  // `state` is a fresh object per response; remembering the last one reported keeps a
  // re-render or a remount of the same response from counting twice.
  const reported = useRef<FormState | null>(null);
  useEffect(() => {
    if (reported.current === state) return;
    reported.current = state;
    const event = formOutcomeEvent(state);
    if (event === "generate_lead") {
      trackEvent("generate_lead", { form_name: formName, ...getParams?.() });
      // The submission also created a portal account: its own event, reported with the lead and
      // before the page leaves (the portal is untagged, so this is the only chance to count it).
      if (state.newPortalAccount) trackEvent("sign_up", { method: "consultation_form" });
    } else if (event === "form_error") {
      trackEvent("form_error", {
        form_name: formName,
        error_category: state.errorCategory ?? "validation",
        error_fields: Object.keys(state.errors ?? {}).join(",") || "none",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
