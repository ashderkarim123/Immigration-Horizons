"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";
import type { FormState } from "@/app/(site)/consultation/actions";

/**
 * Reports a form outcome to GA4 once per server response: `generate_lead` on
 * success, `form_error` (with the field NAMES that failed, never values) on
 * rejection. `getParams` is read at report time so it can close over a ref.
 */
export function useFormTracking(formName: "consultation" | "contact", state: FormState, getParams?: () => Record<string, string>) {
  useEffect(() => {
    if (state.status === "success") {
      trackEvent("generate_lead", { form_name: formName, ...getParams?.() });
    } else if (state.status === "error") {
      trackEvent("form_error", { form_name: formName, error_fields: Object.keys(state.errors ?? {}).join(",") || "none" });
    }
    // `state` is a fresh object per response, which is exactly the once-per-submission trigger wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
