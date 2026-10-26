import { test } from "node:test";
import assert from "node:assert/strict";

import { TRACKING_KEYS, sanitizeTracking, trackingFromForm, trackingFromSearch } from "../src/lib/tracking";

test("only the allowlisted campaign keys survive, from a query string or a form", () => {
  const search = "?utm_source=newsletter&utm_medium=email&utm_campaign=october_guides&gclid=abc123&email=private%40example.com&name=Jane&service=EB-1A";
  assert.deepEqual(trackingFromSearch(search), { utm_source: "newsletter", utm_medium: "email", utm_campaign: "october_guides", gclid: "abc123" });

  const form = new FormData();
  form.set("utm_source", "facebook");
  form.set("message", "private message");
  form.set("email", "private@example.com");
  assert.deepEqual(trackingFromForm(form), { utm_source: "facebook" });
  assert.deepEqual([...TRACKING_KEYS].sort(), ["fbclid", "gclid", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"]);
});

test("values from a crafted URL are trimmed, stripped of control characters and length-limited", () => {
  const long = "a".repeat(400);
  const out = sanitizeTracking((key) => ({ utm_source: "  google\u0000\u001f  ", utm_campaign: long, utm_medium: "", utm_term: 42 }[key]));
  assert.deepEqual(out, { utm_source: "google", utm_campaign: "a".repeat(150) });
});

test("an empty or missing query string yields nothing, and absent values are not stored as empty strings", () => {
  assert.deepEqual(trackingFromSearch(""), {});
  assert.deepEqual(trackingFromSearch("?utm_source=&gclid="), {});
});
