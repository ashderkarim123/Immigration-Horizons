import { test } from "node:test";
import assert from "node:assert/strict";

import { analyticsParams, analyticsTransport, eventForHref, formOutcomeEvent, linkTypeForEvent, pageTypeForPath, trackEvent } from "../src/lib/analytics";

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
  assert.deepEqual(calls, [["event", "generate_lead", { form_name: "consultation", service: "EB-1A", event_version: "1" }]]);
});

test("GTM tracking pushes one custom event and never calls direct gtag", () => {
  const original = process.env.NEXT_PUBLIC_GA_TRANSPORT;
  process.env.NEXT_PUBLIC_GA_TRANSPORT = "gtm";
  const dataLayer: unknown[] = [];
  (globalThis as { window?: unknown }).window = { dataLayer, gtag: () => assert.fail("duplicate transport") };
  try {
    trackEvent("generate_lead", { form_name: "contact", email: "private@example.com", event: "override" });
    assert.deepEqual(dataLayer, [{ form_name: "contact", event_version: "1", event: "generate_lead" }]);
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
    assert.deepEqual(Array.from(dataLayer[1] as ArrayLike<unknown>), ["event", "click_whatsapp", { event_version: "1" }]);
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

test("page_type, cta_placement, cta_id, link_type and error_category accept only their own vocabulary", () => {
  assert.deepEqual(
    analyticsParams({ page_type: "service", cta_placement: "hero", cta_id: "free_consultation", link_type: "whatsapp", error_category: "rate_limit" }),
    { page_type: "service", cta_placement: "hero", cta_id: "free_consultation", link_type: "whatsapp", error_category: "rate_limit" },
  );
  // A URL, a phone number, an email and free text can never ride along in these dimensions.
  assert.deepEqual(
    analyticsParams({ page_type: "/portal/cases/123", cta_placement: "+1 555 123 4567", cta_id: "info@immigrationhorizons.com", link_type: "https://wa.me/1555", error_category: "Jane Doe" }),
    {},
  );
});

test("every event carries the schema version, in both transports", () => {
  const original = process.env.NEXT_PUBLIC_GA_TRANSPORT;
  const run = (transport: string | undefined) => {
    if (transport === undefined) delete process.env.NEXT_PUBLIC_GA_TRANSPORT; else process.env.NEXT_PUBLIC_GA_TRANSPORT = transport;
    const dataLayer: unknown[] = [];
    (globalThis as { window?: unknown }).window = { dataLayer, gtag: (...args: unknown[]) => dataLayer.push(args) };
    try { trackEvent("cta_consultation_click", { page_type: "home", cta_placement: "hero", cta_id: "free_consultation", link_type: "consultation" }); }
    finally { delete (globalThis as { window?: unknown }).window; }
    return JSON.stringify(dataLayer);
  };
  try {
    assert.match(run(undefined), /"event_version":"1"/);
    assert.match(run("gtm"), /"event_version":"1"/);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_GA_TRANSPORT; else process.env.NEXT_PUBLIC_GA_TRANSPORT = original;
  }
});

test("pageTypeForPath classifies a path without ever returning the path", () => {
  assert.equal(pageTypeForPath("/"), "home");
  assert.equal(pageTypeForPath("/services/eb2-niw"), "service");
  assert.equal(pageTypeForPath("/services"), "service");
  assert.equal(pageTypeForPath("/blog/some-post"), "blog");
  assert.equal(pageTypeForPath("/contact/"), "contact");
  assert.equal(pageTypeForPath("/consultation?utm_source=x#form"), "consultation");
  assert.equal(pageTypeForPath("/resources"), "resource");
  assert.equal(pageTypeForPath("/portal/cases/64b0"), "other");
  assert.equal(pageTypeForPath("/privacy"), "other");
});

test("link intent events map to a link type, and non-link events do not", () => {
  assert.equal(linkTypeForEvent("click_whatsapp"), "whatsapp");
  assert.equal(linkTypeForEvent("click_phone"), "phone");
  assert.equal(linkTypeForEvent("click_email"), "email");
  assert.equal(linkTypeForEvent("cta_consultation_click"), "consultation");
  assert.equal(linkTypeForEvent("generate_lead"), null);
});

test("a lead is counted only when the server ACCEPTED it: the honeypot success, an idle form and a rejection are not leads", () => {
  assert.equal(formOutcomeEvent({ status: "success", accepted: true }), "generate_lead");
  assert.equal(formOutcomeEvent({ status: "success" }), null, "honeypot answers success without accepting");
  assert.equal(formOutcomeEvent({ status: "idle" }), null);
  assert.equal(formOutcomeEvent({ status: "error" }), "form_error");
  assert.equal(formOutcomeEvent({ status: "error", accepted: true }), "form_error", "an error is never a lead, whatever else is set");
});

test("sign_up carries only its own method, and thank_you_view carries only safe dimensions", () => {
  assert.deepEqual(analyticsParams({ method: "consultation_form" }), { method: "consultation_form" });
  assert.deepEqual(analyticsParams({ method: "someone@example.com" }), {}, "free text can never ride along in method");
  assert.deepEqual(analyticsParams({ form_name: "consultation", page_type: "consultation", token: "secret", email: "a@b.co" }), { form_name: "consultation", page_type: "consultation" });
});

test("sign_up and thank_you_view reach the dataLayer once each, versioned", () => {
  const dataLayer: unknown[] = [];
  (globalThis as { window?: unknown }).window = { dataLayer, gtag: (...args: unknown[]) => dataLayer.push(args) };
  try {
    trackEvent("sign_up", { method: "consultation_form" });
    trackEvent("thank_you_view", { form_name: "contact", page_type: "contact" });
  } finally { delete (globalThis as { window?: unknown }).window; }
  assert.deepEqual(dataLayer, [
    ["event", "sign_up", { method: "consultation_form", event_version: "1" }],
    ["event", "thank_you_view", { form_name: "contact", page_type: "contact", event_version: "1" }],
  ]);
});
