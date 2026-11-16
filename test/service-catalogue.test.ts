import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { allServices, caseCategories, otherVisas, supportServices } from "../src/lib/content/services";
import { publishedServices, publishedServiceGroups } from "../src/lib/content/published-services";
import { servicePages, servicePageSlugs } from "../src/lib/content/service-pages";
import { footerNav, primaryNav } from "../src/lib/content/navigation";
import { CONSULTATION_SERVICE_VALUES } from "../src/lib/models/Consultation";

const require = createRequire(import.meta.url);
const serverCatalogue = require("../server/utils/services.js");
const serverConsultation = require("../server/models/Consultation.js");
const historicValues = ["EB-2 NIW", "EB-1A", "EB-1B", "EB-1C", "O-1 Visa", "RFE & NOID Responses", "Recommendation Letters", "Expert Opinion Letters", "Business & Personal Plans", "Evidence Review & Packaging", "Immigration Consultation", "Not Sure / Need Guidance"];

test("catalogue prioritizes immigrant petitions and support ahead of all six nonimmigrant classifications", () => {
  assert.deepEqual(caseCategories.map((s) => s.slug), ["eb2-niw", "eb1a", "eb1b", "eb1c"]);
  assert.ok(caseCategories.every((s) => s.tier === "core" && s.classification === "immigrant"));
  assert.ok(supportServices.every((s) => s.tier === "core"));
  assert.deepEqual(otherVisas.map((s) => s.slug), ["o1-visa", "e2-visa", "f1-visa", "f2-visa", "j1-visa", "b1-b2-visa"]);
  assert.ok(otherVisas.every((s) => s.tier === "secondary" && s.classification === "nonimmigrant"));
  assert.equal(new Set(allServices.map((s) => s.slug)).size, 16);
  assert.deepEqual(serverCatalogue, allServices);
});

test("lead enums preserve the historic prefix and match across both deployables", () => {
  assert.deepEqual(CONSULTATION_SERVICE_VALUES.slice(0, historicValues.length), historicValues);
  assert.deepEqual(CONSULTATION_SERVICE_VALUES.slice(historicValues.length), ["NOID Response", "E-2 Visa", "F-1 Visa", "F-2 Visa", "J-1 Visa", "B-1/B-2 Visa"]);
  assert.deepEqual(serverConsultation.schema.path("service").enumValues, [...CONSULTATION_SERVICE_VALUES]);
});

test("publication manifest exactly matches the renderer registry plus the bespoke flagship", () => {
  assert.deepEqual([...servicePageSlugs].sort(), Object.keys(servicePages).sort());
  assert.deepEqual(publishedServices.map((s) => s.slug).sort(), ["eb2-niw", ...servicePageSlugs].sort());
  assert.ok(publishedServices.some((s) => s.slug === "o1-visa"));
  assert.ok(!publishedServices.some((s) => s.slug === "noid-response" || s.slug === "f1-visa"));
});

test("header and footer expose three groups and only implemented routes", () => {
  const mega = primaryNav.find((item) => item.mega)?.mega;
  assert.ok(mega);
  assert.deepEqual(mega.columns.map((c) => c.heading), ["Green card petitions", "RFE, NOID & support", "Other US visas"]);
  assert.deepEqual(mega.columns.map((c) => c.tier), ["core", "core", "secondary"]);
  assert.deepEqual(footerNav.slice(0, 3), mega.columns);
  const routes = new Set(publishedServices.map((s) => `/services/${s.slug}`));
  for (const group of publishedServiceGroups) assert.ok(group.services.length);
  for (const link of [...mega.columns.flatMap((c) => c.links), ...footerNav.flatMap((c) => c.links)]) {
    if (link.href.startsWith("/services/")) assert.ok(routes.has(link.href), link.href);
    assert.ok(!link.href.startsWith("/for/"), "Audience pages are not published in Phase 1");
  }
});
