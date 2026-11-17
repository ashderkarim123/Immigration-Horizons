import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { allServices } from "../src/lib/content/services";
import { ratings } from "../src/lib/content/site";
import {
  featuredTestimonials,
  findReviewFilter,
  reviewFilters,
  testimonials,
  testimonialsFor,
  testimonialsMatching,
} from "../src/lib/content/testimonials";

const slugs = new Set(allServices.map((s) => s.slug));

test("every testimonial is verifiable and tagged only to a real service", () => {
  assert.equal(new Set(testimonials.map((t) => t.id)).size, testimonials.length);
  for (const t of testimonials) {
    assert.match(t.verifyUrl, /^https:\/\//, t.id);
    assert.ok(t.rating >= 1 && t.rating <= 5, t.id);
    assert.ok(t.text.trim().length > 0, t.id);
    if (t.serviceSlug) assert.ok(slugs.has(t.serviceSlug), `${t.id}: ${t.serviceSlug}`);
  }
  assert.ok(featuredTestimonials.length >= 3 && featuredTestimonials.length <= 6);
});

test("review filters cover real slugs and resolve any slug in a group", () => {
  for (const f of reviewFilters) for (const slug of f.slugs) assert.ok(slugs.has(slug), slug);
  assert.equal(findReviewFilter("eb1c")?.label, "EB-1B / EB-1C");
  assert.equal(findReviewFilter("not-a-service"), undefined);
  assert.equal(findReviewFilter(undefined), undefined);
  assert.equal(testimonialsMatching(undefined).length, testimonials.length);
  assert.deepEqual(
    testimonialsMatching(findReviewFilter("eb2-niw")).map((t) => t.id),
    testimonialsFor("eb2-niw").map((t) => t.id),
  );
});

test('ratings are dated and the site never claims to be "5-star rated"', () => {
  for (const r of Object.values(ratings)) {
    assert.equal(r.score === null, r.checkedOn === null);
    if (r.score !== null) assert.ok(r.score <= 5);
  }
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  for (const file of [...walk("src/lib/content"), ...walk("src/components"), ...walk("src/app/(site)")]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /5-star rated/i, file);
  }
});
