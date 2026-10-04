import { test } from "node:test";
import assert from "node:assert/strict";

import { analyticsParams, analyticsTransport, eventForHref, trackEvent } from "../src/lib/analytics";

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

test("direct tracking sends once to gtag without a duplicate GTM custom event", () => {
  assert.doesNotThrow(() => trackEvent("generate_lead", { form_name: "contact" }));

  const calls: unknown[][] = [];
  const dataLayer: unknown[] = [];
  (globalThis as { window?: unknown }).window = { dataLayer, gtag: (...args: unknown[]) => calls.push(args) };
  try {
    trackEvent("generate_lead", { form_name: "consultation", service: "EB-1A" });
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
  assert.deepEqual(dataLayer, []);
  assert.deepEqual(calls, [["event", "generate_lead", { form_name: "consultation", service: "EB-1A" }]]);
});

test("GTM tracking pushes one custom event and never calls direct gtag", () => {
  const original = process.env.NEXT_PUBLIC_GA_TRANSPORT;
  process.env.NEXT_PUBLIC_GA_TRANSPORT = "gtm";
  const dataLayer: unknown[] = [];
  (globalThis as { window?: unknown }).window = { dataLayer, gtag: () => assert.fail("duplicate transport") };
  try {
    trackEvent("generate_lead", { form_name: "contact", email: "private@example.com", event: "override" });
    assert.deepEqual(dataLayer, [{ form_name: "contact", event: "generate_lead" }]);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_GA_TRANSPORT;
    else process.env.NEXT_PUBLIC_GA_TRANSPORT = original;
    delete (globalThis as { window?: unknown }).window;
  }
});

test("early direct events queue as gtag Arguments and preserve existing dataLayer entries", () => {
  const dataLayer: unknown[] = [{ event: "gtm.js" }];
  (globalThis as { window?: unknown }).window = { dataLayer };
  try {
    trackEvent("click_whatsapp");
    assert.equal(dataLayer.length, 2);
    assert.deepEqual(Array.from(dataLayer[1] as ArrayLike<unknown>), ["event", "click_whatsapp", {}]);
  } finally { delete (globalThis as { window?: unknown }).window; }
});

test("tracking parameters exclude personal details, arbitrary text, paths and field values", () => {
  assert.deepEqual(analyticsParams({ form_name: "consultation", service: "O-1 Visa",
    error_fields: "email,private@example.com,message", email: "private@example.com", phone: "123",
    message: "My case", link_text: "Client Name", page_path: "/portal/cases/secret" }),
  { form_name: "consultation", service: "O-1 Visa", error_fields: "email,message" });
  assert.deepEqual(analyticsParams({ service: "Client Name", form_name: "private case" }), {});
});

test("invalid transport values fail closed and off queues nothing", () => {
  assert.equal(analyticsTransport("invalid"), "off");
  assert.equal(analyticsTransport("gtm"), "gtm");
  const original = process.env.NEXT_PUBLIC_GA_TRANSPORT;
  process.env.NEXT_PUBLIC_GA_TRANSPORT = "off";
  const dataLayer: unknown[] = [];
  (globalThis as { window?: unknown }).window = { dataLayer, gtag: () => assert.fail("disabled") };
  try { trackEvent("click_phone"); assert.deepEqual(dataLayer, []); }
  finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_GA_TRANSPORT;
    else process.env.NEXT_PUBLIC_GA_TRANSPORT = original;
    delete (globalThis as { window?: unknown }).window;
  }
});

test("a failed analytics provider cannot break the lead outcome", () => {
  (globalThis as { window?: unknown }).window = { gtag: () => { throw new Error("provider unavailable"); } };
  try { assert.doesNotThrow(() => trackEvent("generate_lead", { form_name: "contact" })); }
  finally { delete (globalThis as { window?: unknown }).window; }
});
