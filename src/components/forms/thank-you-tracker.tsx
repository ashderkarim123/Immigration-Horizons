"use client";

import { useEffect, useRef } from "react";

import { pageTypeForPath, trackEvent } from "@/lib/analytics";

/**
 * Reports that a thank-you page was viewed. A VIEW, not a conversion: the lead itself is
 * reported once, by the form, when the server accepted it (`generate_lead`). A refresh or a
 * visit with no submission can repeat this view but can never count as a lead.
 */
export function ThankYouTracker({ formName }: { formName: "consultation" | "contact" }) {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackEvent("thank_you_view", { form_name: formName, page_type: pageTypeForPath(window.location.pathname) });
  }, [formName]);
  return null;
}
