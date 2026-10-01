import { test } from "node:test";
import assert from "node:assert/strict";

import { eventForHref, trackEvent } from "../src/lib/analytics";

test("eventForHref maps contact links and the consultation CTA, and ignores everything else", () => {
  assert.equal(eventForHref("https://wa.me/15551234567?text=Hi"), "click_whatsapp");
  assert.equal(eventForHref("https://api.whatsapp.com/send?phone=1"), "click_whatsapp");
  assert.equal(eventForHref("mailto:info@immigrationhorizons.com"), "click_email");
  assert.equal(eventForHref("tel:+15551234567"), "click_phone");
  assert.equal(eventForHref("/consultation"), "cta_consultation_click");
  assert.equal(eventForHref("/consultation?service=EB-1A#form"), "cta_consultation_click");
  assert.equal(eventForHref("/consultation-guide"), null);
  assert.equal(eventForHref("/services/eb2-niw"), null);
  assert.equal(eventForHref("https://example.com/wa.me/"), null);
});

test("trackEvent is a safe no-op on the server, and pushes to the dataLayer and gtag in the browser", () => {
  assert.doesNotThrow(() => trackEvent("generate_lead", { form_name: "contact" }));

  const calls: unknown[][] = [];
  const dataLayer: unknown[] = [];
  (globalThis as { window?: unknown }).window = { dataLayer, gtag: (...args: unknown[]) => calls.push(args) };
  try {
    trackEvent("generate_lead", { form_name: "consultation", service: "EB-1A" });
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
  assert.deepEqual(dataLayer, [{ event: "generate_lead", form_name: "consultation", service: "EB-1A" }]);
  assert.deepEqual(calls, [["event", "generate_lead", { form_name: "consultation", service: "EB-1A" }]]);
});
